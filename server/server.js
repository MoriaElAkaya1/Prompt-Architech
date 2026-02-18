const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "OPENAI_API_KEY is not set. /api/chat requests will fail until you configure it."
  );
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
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

  if (!openai) {
    return res.status(503).json({
      ok: false,
      error:
        "OPENAI_API_KEY is not configured on the server. Add it to .env and restart.",
    });
  }

  try {
    const completion = await openai.chat.completions.create({
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
    console.error("OpenAI API error:", error?.message || error);

    if (
      error?.status === 429 &&
      (error?.code === "insufficient_quota" ||
        error?.type === "insufficient_quota")
    ) {
      return res.status(429).json({
        ok: false,
        error:
          "Your OpenAI account has insufficient quota. Add billing/credits, then retry.",
      });
    }

    if (error?.status === 401) {
      return res.status(401).json({
        ok: false,
        error:
          "Invalid API key for this project. Verify OPENAI_API_KEY in .env and restart the server.",
      });
    }

    if (error?.status === 404) {
      return res.status(404).json({
        ok: false,
        error:
          "The configured model is unavailable for this account. Try OPENAI_MODEL=gpt-4o-mini.",
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
