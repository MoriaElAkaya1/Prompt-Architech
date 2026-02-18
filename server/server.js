const path = require("path");
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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const { userInput, systemMessage, temperature } = req.body || {};
  const normalizedTemp =
    typeof temperature === "number" ? Number(temperature.toFixed(1)) : NaN;

  if (typeof userInput !== "string" || !userInput.trim()) {
    return res.status(400).json({
      ok: false,
      error: "User input is required.",
    });
  }

  if (typeof systemMessage !== "string" || !systemMessage.trim()) {
    return res.status(400).json({
      ok: false,
      error: "System message is required.",
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
    });
  }

  if (!client) {
    return res.status(503).json({
      ok: false,
      error:
        "HF_TOKEN is not configured on the server. Add it to .env and restart.",
    });
  }

  try {
    const completion = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: normalizedTemp,
      messages: [
        { role: "system", content: systemMessage.trim() },
        { role: "user", content: userInput.trim() },
      ],
    });

    const result = completion.choices?.[0]?.message?.content?.trim();
    if (!result) {
      return res.status(502).json({
        ok: false,
        error: "The model returned an empty response.",
      });
    }

    return res.json({
      ok: true,
      result,
      meta: {
        model: completion.model || DEFAULT_MODEL,
        temperature: normalizedTemp,
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

    return res.status(500).json({
      ok: false,
      error:
        "Unable to complete your request right now. Check API key and model access.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Prompt Architect server listening on http://localhost:${PORT}`);
});
