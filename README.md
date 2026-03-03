# CareTrust Study

This is a small HCI class project prototype for measuring how much users trust AI-generated healthcare answers. It runs as a localhost app with a frontend on port 3050 and a Gemini backend on port 3051.

## What it includes

- A landing section that explains the study purpose
- Three fixed healthcare scenarios
- Live Gemini responses generated per scenario through a separate local backend
- A trust questionnaire using 1-7 rating scales
- A clinician reference note that can be revealed for comparison
- A local summary view that calculates average trust, safety, and confidence
- CSV export for recorded responses
- PDF export through a print-friendly report window
- Local response storage in `/Users/akeem/github/HCI/data/responses.json`

## How to run

1. Copy `/Users/akeem/github/HCI/.env.example` to `/Users/akeem/github/HCI/.env`
2. Put your Gemini API key in `.env` as `GEMINI_API_KEY=...`
3. Start the backend on port 3051:

```bash
cd /Users/akeem/github/HCI
npm run start:backend
```

4. In a second terminal, start the frontend on port 3050:

```bash
cd /Users/akeem/github/HCI
npm start
```

5. Open `http://127.0.0.1:3050`

After you record at least one response, use the summary section buttons to export:

- `Export CSV` downloads the current results as a spreadsheet-friendly `.csv` file
- `Export PDF` opens a printable report that you can save as PDF from the browser print dialog

Saved responses are also written locally to `/Users/akeem/github/HCI/data/responses.json`, so they persist across refreshes and backend restarts on the same machine.

## Health checks

- Frontend health page: `http://localhost:3050/health.html`
- Backend health JSON: `http://localhost:3051/api/health`

## How to extend it

- Replace the fixed prompts in `/Users/akeem/github/HCI/scenarios.json` with your own study scenarios
- Add participant demographics or SUS-style questions to the form
- Store responses on the server if you want multi-user data collection
