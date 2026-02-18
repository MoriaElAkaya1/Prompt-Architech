# Prompt-Architech: Assignment 2 Prompt Proxy

This project implements a **Prompt Proxy** that wraps user requests with a selected persona and hidden developer rules before sending the final role-separated payload through the Hugging Face Inference Router.

## Assignment Objective Coverage

### API Architecture (Exceptional target)
- Distinct role structure is used on the backend:
  - `system`: persona + hardcoded developer rules
  - `user`: raw end-user input
- API key is server-side only (`.env`), not exposed in browser code.
- Chat call uses an OpenAI-compatible chat endpoint via Hugging Face Router with dynamic temperature.

### Prompt Engineering (Exceptional target)
- Required personas are implemented in UI dropdown:
  - Software Engineer
  - Computer science teacher
  - musician
  - network administrator
  - Artist
  - Photographer
  - nurse
  - pediatrician
- Developer rules are hardcoded and always appended into the system prompt.
- Wrapper enforces instruction hierarchy and anti-jailbreak behavior.

### Parameter Control (Exceptional target)
- Temperature slider is bound to `0.0–2.0` range with `0.1` step.
- Slider value is sent dynamically in API payload.
- Two built-in experiment presets:
  - Deterministic test (`T=0.0`)
  - Creative test (`T=1.5`)
- Balanced budget mode adds input/output caps, caching, and throttling to preserve free-tier usage.

### UI/UX Functionality (Exceptional target)
- Responsive, modern editorial gradient layout.
- Loading spinner + disabled submit while request is in-flight.
- Error and success messaging with clear visual state changes.
- Result card includes output metadata (model + temperature).

### Written Reflection
- See [`REFLECTION.md`](./REFLECTION.md) for deep analysis of token probability, temperature behavior, and instruction-following outcomes.

## Tech Stack
- Frontend: Vanilla `HTML/CSS/JavaScript`
- Backend: `Node.js + Express` (plain JavaScript)
- API SDK: `openai` (used against Hugging Face OpenAI-compatible router)
- Config: `dotenv`

## Project Structure

```text
.
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── server/
│   └── server.js
├── .env.example
├── .gitignore
├── AI_DISCLOSURE.md
├── PRESENTATION_GUIDE.md
├── REFLECTION.md
├── package.json
└── README.md
```

## Setup and Run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create local environment file:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` and set your key:
   ```env
   HF_TOKEN=hf_your_real_token_here
   HF_MODEL=swiss-ai/Apertus-8B-Instruct-2509:publicai
   HF_ROUTER_URL=https://router.huggingface.co/v1
   BUDGET_PROFILE=balanced
   HF_MAX_OUTPUT_TOKENS=220
   HF_MAX_INPUT_CHARS=1800
   HF_CACHE_TTL_SECONDS=1800
   RATE_LIMIT_WINDOW_SECONDS=60
   RATE_LIMIT_MAX_REQUESTS=6
   PORT=3000
   ```
4. Start the app:
   ```bash
   npm start
   ```
5. Open `http://localhost:3000`.

## How the Prompt Wrapper Works

Client-side wrapper (`public/app.js`) builds:

```text
SYSTEM MESSAGE
= "You are acting as a <persona>" + hardcoded developer rules
```

Then sends:

```json
{
  "userInput": "raw user prompt",
  "systemMessage": "combined system prompt with developer rules",
  "temperature": 1.0
}
```

Backend (`server/server.js`) forwards to Hugging Face Router as:

```json
{
  "model": "swiss-ai/Apertus-8B-Instruct-2509:publicai",
  "temperature": 1.0,
  "messages": [
    { "role": "system", "content": "combined system message" },
    { "role": "user", "content": "raw user input" }
  ]
}
```

## API Endpoint

### `POST /api/chat`

Request body:

```json
{
  "userInput": "string",
  "systemMessage": "string",
  "temperature": 0.0
}
```

Success response:

```json
{
  "ok": true,
  "result": "model output text",
  "meta": {
    "model": "swiss-ai/Apertus-8B-Instruct-2509:publicai",
    "temperature": 0.0,
    "cacheHit": false,
    "maxOutputTokens": 220,
    "budgetProfile": "balanced"
  }
}
```

Error response:

```json
{
  "ok": false,
  "error": "safe user-facing message",
  "code": "ERROR_CODE",
  "retryAfterSeconds": 12
}
```

## Free-Tier Budget Mode (Balanced)
- `HF_MAX_OUTPUT_TOKENS=220`: caps completion length to reduce credit burn.
- `HF_MAX_INPUT_CHARS=1800`: rejects oversized prompts before provider call.
- `HF_CACHE_TTL_SECONDS=1800`: returns cached responses for identical requests for 30 minutes.
- In-flight dedupe: identical simultaneous requests share one provider call.
- `RATE_LIMIT_WINDOW_SECONDS=60` and `RATE_LIMIT_MAX_REQUESTS=6`: per-IP throttling prevents rapid drain.

UI budget feedback:
- Character counter with warning at `1500` and client-side hard stop at `1800`.
- Cooldown countdown after `RATE_LIMITED` responses.
- Result metadata includes `cacheHit`, `maxOutputTokens`, and `budgetProfile`.

## Troubleshooting

| HTTP | Code | Meaning | Action |
|---|---|---|---|
| 402 | `HF_CREDITS_DEPLETED` | Hugging Face credits are exhausted | Wait for reset or add credits/PRO |
| 429 | `RATE_LIMITED` | App-level throttle triggered | Wait `retryAfterSeconds` then retry |
| 429 | `HF_PROVIDER_RATE_LIMITED` | Provider-side limit reached | Slow request rate or wait/reset |
| 401 | `INVALID_HF_TOKEN` | Token invalid/missing permission | Regenerate token with Inference Provider access |
| 404 | `HF_MODEL_NOT_AVAILABLE` | Selected model unavailable | Use supported model, default in `.env.example` |

## Security Notes
- `.env` is gitignored and must never be committed.
- API key remains server-side only.
- Frontend never embeds provider credentials.

## Presentation Materials
- Live demo script: [`PRESENTATION_GUIDE.md`](./PRESENTATION_GUIDE.md)
- Reflection talking points: [`REFLECTION.md`](./REFLECTION.md)
- AI usage declaration: [`AI_DISCLOSURE.md`](./AI_DISCLOSURE.md)
