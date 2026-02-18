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
    "temperature": 0.0
  }
}
```

Error response:

```json
{
  "ok": false,
  "error": "safe user-facing message"
}
```

## Security Notes
- `.env` is gitignored and must never be committed.
- API key remains server-side only.
- Frontend never embeds provider credentials.

## Presentation Materials
- Live demo script: [`PRESENTATION_GUIDE.md`](./PRESENTATION_GUIDE.md)
- Reflection talking points: [`REFLECTION.md`](./REFLECTION.md)
- AI usage declaration: [`AI_DISCLOSURE.md`](./AI_DISCLOSURE.md)
