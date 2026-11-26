# AI Interview Assistant

Prepare for technical interviews with AI practice, mock interviews, and feedback. Get live help with questions in sessions where AI assistance is permitted.

> **Status:** all 10 phases complete. Real accounts; a database-backed question bank; AI answers, explanations and code review; the Screen Assistant (on-device OCR); voice questions and answers with speech-pattern feedback; the Electron floating assistant; mock interviews with AI feedback and stored reports; and history, a live dashboard, data export and retention controls. Every screen uses real data; there is no sample data left. See the [roadmap](#roadmap).

## Docs
- [Setup guide (step by step)](docs/SETUP.md)
- [Architecture, folder structure & API](docs/ARCHITECTURE.md)
- [Database design](docs/DATABASE.md)
- [UI design system & wireframes](docs/UI_DESIGN.md)

## Tech stack
React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui · React Router · Redux Toolkit / RTK Query — Node.js · Express 5 · MongoDB (Mongoose) · Zod — OpenAI API — Electron — Vitest · Testing Library · Supertest

## Prerequisites
- **Node.js 20.11+** (developed on Node 24)
- **MongoDB 7+**, either a local install or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- An **OpenAI API key** for AI features. Set `OPENAI_API_KEY` in `apps/server/.env`; the key stays on the server. Without it the app still runs, and AI features show "AI is not set up yet". Model names are configurable with `OPENAI_MODEL` and `OPENAI_MODEL_QUALITY`.

## Setup

```bash
npm install                                     # installs all workspaces
cp apps/server/.env.example apps/server/.env    # then set MONGODB_URI and JWT_ACCESS_SECRET
cp apps/client/.env.example apps/client/.env    # optional, defaults work in dev
npm run dev                                     # shared (watch) + API :5000 + web :5173
```

### Desktop app (floating assistant)
With `npm run dev` running, open a second terminal:

```bash
npm run dev:desktop      # compiles apps/desktop and starts Electron
```

The desktop app is a thin shell around the web app: it loads `http://localhost:5173/desktop` (set `AIA_APP_URL` to point it at another deployment, e.g. `AIA_APP_URL=https://app.example.com`). Sign in once in the panel. Then:

- **Bubble ↔ panel**: the minimise button collapses the assistant into a 72 px bubble you can drag anywhere; click the bubble to open the panel again.
- **Ctrl/⌘ + Shift + Space** shows or hides the assistant from anywhere. The tray menu shows what is being captured and has Show/Hide assistant, Always on top and Quit; closing the window only hides it to the tray.
- **Keep on top** (pin button) is on by default and can be turned off.
- **Screen** tab: when you start reading, the app's own picker lists your screens and windows; nothing is shared until you choose one. The tray icon turns red and its tooltip says what is being captured whenever the screen or microphone is in use.
- The window is deliberately **visible in screen shares and recordings**.

Open http://localhost:5173 and create an account. The top bar shows **API online** once the client, API, and database are all connected.

**Production checklist:** set a long random `JWT_ACCESS_SECRET` (the server refuses to start with the default), serve over HTTPS (the refresh cookie is `Secure` in production), and set `CLIENT_ORIGINS` to your web app's URL. If the web app and API are on different sites, set `COOKIE_SAMESITE=none`.

## Scripts (run from the repo root)

| Command | What it does |
|---|---|
| `npm run dev` | Build shared types, then run shared (watch), server (tsx watch), and client (Vite) together |
| `npm run dev:server` / `npm run dev:client` | Run one side only |
| `npm run dev:desktop` | Build and start the Electron desktop assistant (needs the web app running) |
| `npm test` | Server, client and desktop tests (see [Testing](#testing)); MongoDB runs in memory, so no install is needed |
| `npm run typecheck` | Strict TypeScript across all workspaces |
| `npm run build` | Production build: `apps/server/dist`, `apps/client/dist` and `apps/desktop/dist` |
| `npm run seed` | Load or update the categories and starter question bank (safe to re-run; it never duplicates or touches users' own questions). The server also seeds automatically on first start with an empty database. |
| `npm start -w @aia/server` | Run the built API |

## Repository layout
```
packages/shared   @aia/shared — enums, API types, text normalisation shared by both sides
apps/server       @aia/server — Express REST API (/api/v1), Mongoose models, tests
apps/client       @aia/client — React SPA
apps/desktop      @aia/desktop — Electron floating assistant (see apps/desktop/README.md)
docs/             architecture, database and UI design
```

## Testing
| Layer | What it covers | Where |
|---|---|---|
| API (Vitest + Supertest, real MongoDB in memory) | Every endpoint, validation, ownership between users, rate limits, AI prompts and error mapping (fake AI provider), history, dashboard maths, retention, export, and a security sweep: auth on every data route, forged tokens, headers, `no-store` caching, body size, operator injection, malformed ids | `apps/server/tests` |
| Client (Vitest + Testing Library, jsdom) | Full app flows against an in-memory fake API that uses the same shared Zod schemas: sign-in, practice, AI answers, screen reading (fake media), voice (fake mic), mock interviews, history, dashboard, settings, export, desktop panel (fake bridge) | `apps/client/src/test` |
| Desktop (Vitest) | Navigation, permission, geometry, tray and payload rules of the Electron shell | `apps/desktop/tests` |

`npm test` runs all three. Before each phase was signed off, the real stack was also driven end to end in headless Chrome and in Electron over the DevTools protocol, with a local OpenAI-compatible stub instead of the real API, a synthetic screen and a fake microphone (no real screen or mic is ever captured by tests).

## Privacy principles
Only text is sent to the server. OCR runs on your machine, using an engine served by this app (no third-party downloads). Screenshots and raw audio are never stored: recordings are transcribed in memory and discarded. Speech-to-text goes through our server by default; the browser's own speech service is an opt-in, labelled alternative (it sends audio to the browser vendor). Screen and mic capture need your explicit consent and always show a visible indicator. Answers are saved to History only while **Save history** is on. Everything follows your retention period (changing it re-applies to what is already stored), and you can delete single entries, one kind of history, everything, or your whole account, or download all of it as JSON (**Settings → Privacy → Export my data**). Mock interviews keep their answer text and report even with Save history off, because resuming and the report need them; you can delete each one. The assistant window is not hidden from screen sharing, and the app never tries to bypass interview-platform monitoring. See [Security & privacy](docs/ARCHITECTURE.md#6-security--privacy).

## Roadmap
| # | Phase | Status |
|---|---|---|
| 1 | Project setup & architecture | ✅ Done |
| 2 | Dashboard & complete frontend UI | ✅ Done |
| 3 | Authentication & user management | ✅ Done |
| 4 | Question database & categories | ✅ Done |
| 5 | AI answer generation | ✅ Done |
| 6 | OCR & screen reading | ✅ Done |
| 7 | Voice recognition & speech output | ✅ Done |
| 8 | Electron floating assistant | ✅ Done |
| 9 | Mock interview & answer evaluation | ✅ Done |
| 10 | History, analytics, security & testing | ✅ Done |

## Troubleshooting
- **`API offline` in the top bar:** the server isn't running on port 5000, or `VITE_DEV_API_PROXY` points somewhere else.
- **`Database unavailable`:** check `MONGODB_URI` and that MongoDB is running or reachable. For Atlas, add your IP to the network access list.
- **First `npm test` is slow:** mongodb-memory-server downloads a MongoDB binary once (~100 MB) and caches it.
- **Blank page or "Invalid hook call" after adding a dependency in dev:** add it to `optimizeDeps.include` in `apps/client/vite.config.ts`, delete `apps/client/node_modules/.vite`, and restart `npm run dev`.
- **Desktop app exits immediately** (`Cannot read properties of undefined (reading 'handle')` or similar): `ELECTRON_RUN_AS_NODE` is set in your environment, which makes Electron run as plain Node. VS Code's integrated terminal can set it. Run `unset ELECTRON_RUN_AS_NODE` (PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE`) or use a normal terminal.
- **`Electron failed to install correctly`:** the binary download was skipped or blocked. Run `npx install-electron` from the repo root, or reinstall with `npm install`.
- **Desktop panel says "Can't reach Interview AI":** the web app isn't running at `AIA_APP_URL` (default `http://localhost:5173`). It retries every 5 seconds, so just start `npm run dev`.
