const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HF_ROUTER_URL =
  process.env.HF_ROUTER_URL || "https://router.huggingface.co/v1";
const DEFAULT_MODEL =
  process.env.HF_MODEL || "swiss-ai/Apertus-8B-Instruct-2509:publicai";
const API_TOKEN = process.env.HF_TOKEN || process.env.OPENAI_API_KEY;
const BUDGET_PROFILE = process.env.BUDGET_PROFILE || "balanced";

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const HF_MAX_OUTPUT_TOKENS = parsePositiveInt(
  process.env.HF_MAX_OUTPUT_TOKENS,
  220
);
const HF_MAX_INPUT_CHARS = parsePositiveInt(process.env.HF_MAX_INPUT_CHARS, 1800);
const HF_CACHE_TTL_SECONDS = parsePositiveInt(process.env.HF_CACHE_TTL_SECONDS, 1800);
const RATE_LIMIT_WINDOW_SECONDS = parsePositiveInt(
  process.env.RATE_LIMIT_WINDOW_SECONDS,
  60
);
const RATE_LIMIT_MAX_REQUESTS = parsePositiveInt(
  process.env.RATE_LIMIT_MAX_REQUESTS,
  6
);

const cacheByRequestKey = new Map();
const inFlightByRequestKey = new Map();
const requestTimestampsByIp = new Map();

if (!API_TOKEN) {
  console.warn(
    "HF_TOKEN is not set. /api/chat requests will fail until you configure it."
  );
}

if (!process.env.HF_TOKEN && process.env.OPENAI_API_KEY) {
  console.warn(
    "Using OPENAI_API_KEY as fallback token. Rename it to HF_TOKEN in .env."
  );
}

const client = API_TOKEN
  ? new OpenAI({
      apiKey: API_TOKEN,
      baseURL: HF_ROUTER_URL,
    })
  : null;

function buildRequestKey({ model, temperature, systemMessage, userInput, maxTokens }) {
  const material = `${model}|${temperature}|${maxTokens}|${systemMessage}|${userInput}`;
  return crypto.createHash("sha256").update(material).digest("hex");
}

function readCache(requestKey) {
  const cached = cacheByRequestKey.get(requestKey);
  if (!cached) {
    return null;
  }

  if (Date.now() >= cached.expiresAt) {
    cacheByRequestKey.delete(requestKey);
    return null;
  }

  return cached.value;
}

function writeCache(requestKey, value) {
  cacheByRequestKey.set(requestKey, {
    value,
    expiresAt: Date.now() + HF_CACHE_TTL_SECONDS * 1000,
  });
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = RATE_LIMIT_WINDOW_SECONDS * 1000;
  const recent = (requestTimestampsByIp.get(ip) || []).filter(
    (timestamp) => now - timestamp < windowMs
  );

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (now - oldest)) / 1000)
    );
    requestTimestampsByIp.set(ip, recent);
    return { limited: true, retryAfterSeconds };
  }

  recent.push(now);
  requestTimestampsByIp.set(ip, recent);
  return { limited: false, retryAfterSeconds: 0 };
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const { userInput, systemMessage, temperature } = req.body || {};
  const trimmedUserInput = typeof userInput === "string" ? userInput.trim() : "";
  const trimmedSystemMessage =
    typeof systemMessage === "string" ? systemMessage.trim() : "";
  const normalizedTemp =
    typeof temperature === "number" ? Number(temperature.toFixed(1)) : NaN;

  if (!trimmedUserInput) {
    return res.status(400).json({
      ok: false,
      error: "User input is required.",
      code: "INVALID_INPUT",
    });
  }

  if (!trimmedSystemMessage) {
    return res.status(400).json({
      ok: false,
      error: "System message is required.",
      code: "INVALID_SYSTEM_MESSAGE",
    });
  }

  if (trimmedUserInput.length > HF_MAX_INPUT_CHARS) {
    return res.status(400).json({
      ok: false,
      error: `User input is too long. Maximum length is ${HF_MAX_INPUT_CHARS} characters.`,
      code: "INPUT_TOO_LONG",
    });
  }

  if (
    Number.isNaN(normalizedTemp) ||
    normalizedTemp < 0 ||
    normalizedTemp > 2
  ) {
    return res.status(400).json({
      ok: false,
      error: "Temperature must be a number between 0.0 and 2.0.",
      code: "INVALID_TEMPERATURE",
    });
  }

  if (!client) {
    return res.status(503).json({
      ok: false,
      error:
        "HF_TOKEN is not configured on the server. Add it to .env and restart.",
      code: "MISSING_HF_TOKEN",
    });
  }

  const requestKey = buildRequestKey({
    model: DEFAULT_MODEL,
    temperature: normalizedTemp,
    systemMessage: trimmedSystemMessage,
    userInput: trimmedUserInput,
    maxTokens: HF_MAX_OUTPUT_TOKENS,
  });

  const cachedResponse = readCache(requestKey);
  if (cachedResponse) {
    return res.json({
      ok: true,
      result: cachedResponse.result,
      meta: {
        model: cachedResponse.model,
        temperature: cachedResponse.temperature,
        cacheHit: true,
        maxOutputTokens: HF_MAX_OUTPUT_TOKENS,
        budgetProfile: BUDGET_PROFILE,
      },
    });
  }

  let requestPromise = inFlightByRequestKey.get(requestKey);
  let createdNewRequest = false;

  if (!requestPromise) {
    const ip = getClientIp(req);
    const rateLimit = checkRateLimit(ip);
    if (rateLimit.limited) {
      return res.status(429).json({
        ok: false,
        error: "Too many requests. Please wait before trying again.",
        code: "RATE_LIMITED",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
    }

    requestPromise = (async () => {
      const completion = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: normalizedTemp,
        max_tokens: HF_MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: trimmedSystemMessage },
          { role: "user", content: trimmedUserInput },
        ],
      });

      const result = completion.choices?.[0]?.message?.content?.trim();
      if (!result) {
        const noResultError = new Error("The model returned an empty response.");
        noResultError.status = 502;
        throw noResultError;
      }

      return {
        result,
        model: completion.model || DEFAULT_MODEL,
        temperature: normalizedTemp,
      };
    })();

    createdNewRequest = true;
    inFlightByRequestKey.set(requestKey, requestPromise);
  }

  try {
    const completed = await requestPromise;

    if (createdNewRequest) {
      writeCache(requestKey, completed);
    }

    return res.json({
      ok: true,
      result: completed.result,
      meta: {
        model: completed.model,
        temperature: completed.temperature,
        cacheHit: false,
        maxOutputTokens: HF_MAX_OUTPUT_TOKENS,
        budgetProfile: BUDGET_PROFILE,
      },
    });
  } catch (error) {
    console.error("Hugging Face Router API error:", error?.message || error);

    if (error?.status === 429) {
      return res.status(429).json({
        ok: false,
        error:
          "Hugging Face rate limit or quota reached. Check your HF plan/credits and retry.",
      });
    }

    if (error?.status === 401) {
      return res.status(401).json({
        ok: false,
        error:
          "Invalid token. Verify HF_TOKEN in .env and restart the server.",
      });
    }

    if (error?.status === 404) {
      return res.status(404).json({
        ok: false,
        error:
          "Configured HF model is unavailable. Try HF_MODEL=swiss-ai/Apertus-8B-Instruct-2509:publicai.",
      });
    }

    if (error?.status === 502) {
      return res.status(502).json({
        ok: false,
        error: "The model returned an empty response.",
      });
    }

    return res.status(500).json({
      ok: false,
      error:
        "Unable to complete your request right now. Check API key and model access.",
    });
  } finally {
    if (createdNewRequest) {
      inFlightByRequestKey.delete(requestKey);
    }
  }
});

app.listen(PORT, () => {
  console.log(
    `[budget-config] profile=${BUDGET_PROFILE}, maxOutputTokens=${HF_MAX_OUTPUT_TOKENS}, maxInputChars=${HF_MAX_INPUT_CHARS}, cacheTtlSeconds=${HF_CACHE_TTL_SECONDS}, rateLimitWindowSeconds=${RATE_LIMIT_WINDOW_SECONDS}, rateLimitMaxRequests=${RATE_LIMIT_MAX_REQUESTS}`
  );
  console.log(`Prompt Architect server listening on http://localhost:${PORT}`);
});
