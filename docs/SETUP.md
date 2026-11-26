# Setup guide

Step-by-step instructions to get AI Interview Assistant running on your computer, from a fresh machine to your first mock interview. Commands are shown for Windows (PowerShell); macOS/Linux equivalents are noted where they differ.

**Time needed:** about 20 minutes, most of it creating the MongoDB and OpenAI accounts.

---

## Step 1 — Install the tools

| Tool | Version | How to check | Get it |
|---|---|---|---|
| Node.js (includes npm) | 20.11 or newer | `node -v` | https://nodejs.org (choose the LTS installer) |
| Git | any recent | `git --version` | https://git-scm.com/downloads |

Close and reopen your terminal after installing so the commands are found.

## Step 2 — Get the code

```powershell
git clone https://github.com/nimeshdesign/ai-assistant.git
cd ai-assistant
npm install
```

`npm install` installs everything for all parts of the project (web app, server, shared code and desktop app) in one go. It takes a few minutes the first time and also downloads Electron for the desktop app.

## Step 3 — Create a database (MongoDB)

Choose **one** option.

### Option A: MongoDB Atlas (free, recommended, nothing to install)

1. Sign up at https://www.mongodb.com/atlas and create a **free (M0) cluster**.
2. **Database Access** → *Add New Database User*: choose a username and password (avoid `@`, `:` and `/` in the password, or URL-encode them).
3. **Network Access** → *Add IP Address* → *Add Current IP Address*.
4. **Database** → *Connect* → *Drivers*. Copy the connection string. It looks like:
   `mongodb+srv://<user>:<password>@cluster0.abcde.mongodb.net/`
5. Put your password in, and add a database name before the `?` (or at the end):
   `mongodb+srv://esha:MyPass123@cluster0.abcde.mongodb.net/ai_interview_assistant`

### Option B: MongoDB on your computer

1. Install **MongoDB Community Server**: https://www.mongodb.com/try/download/community (keep "Install as a Service" ticked).
2. Your connection string is:
   `mongodb://127.0.0.1:27017/ai_interview_assistant`

## Step 4 — Get an OpenAI API key

1. Sign in at https://platform.openai.com, add a payment method or credits under **Billing**.
2. **API keys** → *Create new secret key*. Copy it (it starts with `sk-`); you won't see it again.

Without a key the app still starts, but AI answers, mock-interview feedback, AI-generated questions and server speech-to-text show "AI is not set up yet". The question bank, practice flow and everything else work.

> The key only ever lives on the server. It is never sent to the browser. Never commit it or share it.

## Step 5 — Configure the server

Create the settings file from the example:

```powershell
Copy-Item apps/server/.env.example apps/server/.env
```
(macOS/Linux: `cp apps/server/.env.example apps/server/.env`)

Open `apps/server/.env` in an editor and change these three lines:

```ini
MONGODB_URI=<your connection string from Step 3>
JWT_ACCESS_SECRET=<a random value, at least 32 characters>
OPENAI_API_KEY=<your key from Step 4>
```

To generate a good `JWT_ACCESS_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Everything else can stay as it is. For reference:

| Setting | Default | What it does |
|---|---|---|
| `PORT` | `5000` | Port of the API server |
| `CLIENT_ORIGINS` | `http://localhost:5173` | Web addresses allowed to call the API (comma-separated) |
| `OPENAI_MODEL` / `OPENAI_MODEL_QUALITY` | `gpt-4o-mini` / `gpt-4o` | Models for "Fast" and "Best quality" (Settings → AI model) |
| `OPENAI_STT_MODEL` / `OPENAI_TTS_MODEL` | `gpt-4o-mini-transcribe` / `gpt-4o-mini-tts` | Speech-to-text and natural read-aloud |
| `AI_RATE_LIMIT_PER_5MIN` | `30` | AI requests allowed per user every 5 minutes (cost control) |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL_DAYS` | `15m` / `7` | How long sign-ins last |
| `LOG_LEVEL` | `info` | Server log detail |

The web app needs no configuration for local use. (`apps/client/.env.example` exists only if you change the API port or deploy the web app separately.)

## Step 6 — Start the app

```powershell
npm run dev
```

This starts three things together: shared code (watching for changes), the API on **http://localhost:5000** and the web app on **http://localhost:5173**. Leave this terminal open; press `Ctrl+C` to stop.

On the first start the server fills the database with the question categories and starter question bank automatically.

## Step 7 — Check it works

1. Open **http://localhost:5173**.
2. Click **Create an account** and sign up (password: at least 8 characters, with a letter and a number).
3. The top bar should say **API online** (green dot).
4. Go to **AI Tools**, type `What is a closure in JavaScript?` and click **Get answer**. You should see a five-part answer within a few seconds.

If all four work, setup is complete.

## Step 8 — First use

- **Settings → Profile:** set your target role, experience level and languages. Answers and mock interviews adapt to them.
- **Settings → Answers:** default answer length (short / normal / detailed) and style.
- **Settings → Privacy:** whether to save history, how long to keep it, and **Export my data**.
- **Screen Assistant / Voice:** the first time, the app asks for your consent, then your browser asks which screen to share or for microphone access. Use Chrome or Edge for the best support. Only use these where AI help is permitted.

## Step 9 (optional) — The floating desktop assistant

With `npm run dev` still running, open a **second** terminal in the project folder:

```powershell
npm run dev:desktop
```

A small always-on-top window opens with Screen, Voice and Ask tabs. Sign in once inside it.

- The minimise button turns it into a draggable bubble; click the bubble to open it again.
- **Ctrl+Shift+Space** (⌘+Shift+Space on Mac) shows or hides it from anywhere.
- Closing it hides it to the system tray; quit from the tray icon.
- The window is intentionally visible in screen shares and recordings.

The desktop app runs from the source code; there is no installer yet. See [apps/desktop/README.md](../apps/desktop/README.md) for details.

## Step 10 (optional) — Run the tests

```powershell
npm test          # server, web and desktop tests (no database or API key needed)
npm run typecheck # strict TypeScript checks
```

The first test run downloads a MongoDB test binary (~100 MB) once.

---

## Running in production

```powershell
npm run build
```

This produces `apps/server/dist` (the API) and `apps/client/dist` (static web files). They are deployed separately:

1. **API:** run `npm start -w @aia/server` on a Node host with these environment variables set:
   - `NODE_ENV=production`
   - a real `JWT_ACCESS_SECRET` (the server refuses to start with the default)
   - `MONGODB_URI` and `OPENAI_API_KEY`
   - `CLIENT_ORIGINS=https://your-web-app-address`
   - Serve it over **HTTPS**, because sign-in cookies are `Secure` in production.
2. **Web app:** before building, set `VITE_API_URL=https://your-api-address/api/v1` in `apps/client/.env`. Then host `apps/client/dist` on any static host, and route unknown paths to `index.html`.
3. If the web app and API are on **different sites** (not just different subdomains), also set `COOKIE_SAMESITE=none` on the API.
4. **Desktop app:** point it at your deployed web app with `AIA_APP_URL=https://your-web-app-address npm run dev:desktop`.

## Troubleshooting

| Problem | Fix |
|---|---|
| Top bar says **API offline** | The server isn't running or crashed. Check the `npm run dev` terminal for a red error. |
| **Database unavailable** | `MONGODB_URI` is wrong, MongoDB isn't running (Option B), or your IP isn't allowed in Atlas → Network Access. |
| Server stops with `JWT_ACCESS_SECRET` error | It must be at least 32 characters. |
| **AI is not set up yet** | `OPENAI_API_KEY` is empty. Save `.env`, stop with `Ctrl+C`, run `npm run dev` again. |
| AI says it's **busy** or **unavailable** | Check your OpenAI billing/credits and usage limits; try again shortly. |
| **"You've made a lot of AI requests"** | The per-user limit (`AI_RATE_LIMIT_PER_5MIN`) was reached; wait a few minutes or raise it. |
| `EADDRINUSE` / port already in use | Something else uses port 5000 or 5173. Close it, or change `PORT` (and `VITE_DEV_API_PROXY` in `apps/client/.env`). |
| Blank page after adding a package | Delete `apps/client/node_modules/.vite` and restart `npm run dev`. |
| Desktop window closes immediately | `ELECTRON_RUN_AS_NODE` is set (VS Code's terminal can set it). Use a normal terminal, or run `Remove-Item Env:ELECTRON_RUN_AS_NODE` first. |
| `Electron failed to install correctly` | Run `npx install-electron`, or `npm install` again. |
| Desktop shows **Can't reach Interview AI** | Start `npm run dev` first; the window retries every 5 seconds. |
| Screen sharing or mic doesn't start | Allow the permission in your browser (padlock icon in the address bar) and in Settings → Privacy → Permissions. |
