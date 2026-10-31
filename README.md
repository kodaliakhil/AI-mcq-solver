# MCQ Snap Solver

Mobile-friendly React app. You capture MCQ question images one after another, and each image goes to the Gemini API in a background queue (2 at a time, with automatic retry on rate limits). The **Answers** tab fills in a live answer key while you keep capturing.

## Run
```bash
npm install
npm run dev
```
Vite prints a `Network: https://192.168.x.x:5173` URL. Open it on your phone (same Wi-Fi) and accept the self-signed certificate warning.
HTTPS is required for live camera access on phones. If the live camera doesn't work, the "Photo / Gallery" button uses the phone's native camera instead.

## Setup
1. Get an API key from Google AI Studio (https://aistudio.google.com/apikey).
2. Open ⚙️ Settings, paste the key, and optionally tap "Fetch available models" to choose a model (the default is `gemini-flash-latest`).

## Tuning
- `CONCURRENCY` in `src/App.jsx`: how many images are solved in parallel. Use 1 on free-tier keys.
- `PROMPT` / `SCHEMA` in `src/gemini.js`: what Gemini extracts and returns.
- `MAX_SIDE` in `src/image.js`: the resize limit before upload.

## Security note
The API key is stored in the browser and called directly from the client, which is fine for personal use.
If you host this publicly, move the `solveImage` call behind a small server or serverless proxy so the key stays secret.
