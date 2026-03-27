# CareTrust Study

This is a small HCI class project prototype for measuring how much users trust AI-generated healthcare answers. It runs as a localhost app with a frontend on port 3050 and an OpenRouter-backed API on port 3051.

## What it includes

- A landing section that explains the study purpose
- Twelve fixed healthcare scenarios
- Live AI model responses generated per scenario through a separate local backend
- A trust questionnaire using 1-7 rating scales
- A clinician guidance benchmark that can be revealed for comparison
- A local summary view that calculates average trust, safety, and confidence
- CSV export for recorded responses
- PDF export through a print-friendly report window
- Local response storage in `/Users/akeem/github/HCI/data/responses.json`

## How to run

1. Copy `/Users/akeem/github/HCI/.env.example` to `/Users/akeem/github/HCI/.env`
2. Put your OpenRouter API key in `.env` as `OPENROUTER_API_KEY=...`
3. Set the primary model in `.env` as `OPENROUTER_MODEL=qwen/qwen3-coder:free`
4. Set fallback models in `.env` with `OPENROUTER_FALLBACK_MODELS=...` so the backend can fail over when one free route breaks
5. Optionally set `OPENROUTER_MAX_TOKENS=350` to keep the response budget reasonable
6. Set `OPENROUTER_REASONING_ENABLED=false` when using free models so the token budget goes to the final answer
7. Optionally set `OPENROUTER_REASONING_EFFORT=medium`
8. Start the backend on port 3051:

```bash
cd /Users/akeem/github/HCI
npm run start:backend
```

9. In a second terminal, start the frontend on port 3050:

```bash
cd /Users/akeem/github/HCI
npm start
```

10. Open `http://127.0.0.1:3050`

After you record at least one response, use the summary section buttons to export:

- `Export CSV` downloads the current results as a spreadsheet-friendly `.csv` file
- `Export PDF` opens a printable report that you can save as PDF from the browser print dialog

Saved responses are also written locally to `/Users/akeem/github/HCI/data/responses.json`, so they persist across refreshes and backend restarts on the same machine.
Generated model answers are cached locally in `/Users/akeem/github/HCI/data/generated-answers.json`, and the cache stores the actual model that answered each scenario. Using `Clear All Responses` also clears that generated-answer cache so a new survey starts fresh.

## Health checks

- Frontend health page: `http://localhost:3050/health.html`
- Backend health JSON: `http://localhost:3051/api/health`

## How to extend it

- Replace the fixed prompts in `/Users/akeem/github/HCI/scenarios.json` with your own study scenarios
- Add participant demographics or SUS-style questions to the form
- Store responses on the server if you want multi-user data collection
