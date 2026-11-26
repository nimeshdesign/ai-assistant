# @aia/desktop — Electron floating assistant

A thin, locked-down Electron shell around the web app. It opens one frameless, transparent, always-on-top window that loads the client's `/desktop` route, so all UI, OCR, voice and AI code lives in `apps/client` and is not duplicated here.

## Run

```bash
npm run dev            # from the repo root: API + web app on :5173
npm run dev:desktop    # second terminal: compile this package and start Electron
```

| Env var | Default | Purpose |
|---|---|---|
| `AIA_APP_URL` | `http://localhost:5173` | Web app the window loads (`<url>/desktop`). Only this origin may be loaded or use the bridge. |
| `AIA_USER_DATA` | Electron default | Profile folder override (cookies and local storage). |
| `AIA_E2E` | unset | Test mode: window stays hidden, no tray or global shortcut, and a read-only `__e2eState()` is added to the bridge. Never set it for real use. |

If Electron exits at once, `ELECTRON_RUN_AS_NODE` is probably set (VS Code's terminal can set it); unset it. If the binary is missing, run `npx install-electron`.

## What it does

- **Panel ↔ bubble.** Starts as a 440×720 panel (min 360×480) in the bottom-right of the work area. Collapse turns it into a 72 px draggable bubble anchored to the same corner; clicking the bubble expands it again, clamped to the screen. Any route other than `/desktop` (such as sign-in) always shows as the panel.
- **Always on top** by default; toggle it from the panel's pin button or the tray menu.
- **Tray + shortcut.** `Ctrl/⌘ + Shift + Space` shows or hides the window. The tray menu shows what is being captured and has Show/Hide, Always on top and Quit. Closing the window hides it to the tray.
- **Screen picker.** When the page calls `getDisplayMedia`, the main process lists screens and windows (excluding itself) and the page shows its own "Choose what to share" dialog. Nothing is shared until the user picks; Cancel or a 2-minute timeout denies the request.
- **Capture indicators.** The page reports `{ screen, microphone }` whenever capture changes. The tray icon turns red and its tooltip says what is captured (e.g. "Interview AI — capturing screen and microphone").
- **Offline web app.** If the URL can't be loaded, the window shows "Can't reach Interview AI" and retries every 5 seconds.

## Security

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, dedicated `persist:aia` session, `<webview>` blocked.
- The page sees only `window.desktop` (the `DesktopBridge` type in `@aia/shared`): `getState`, `setMode`, `setAlwaysOnTop`, `hide`, `reportCapture`, `onPickSource`, `chooseSource`, `onStateChange`, `platform`.
- IPC is accepted only from the app origin, and every payload is validated; malformed values are ignored, not coerced.
- Navigation and redirects outside the app origin are blocked. Pop-ups are denied; only `https:` links without credentials open in the system browser.
- Permissions: microphone (camera denied), display capture and clipboard writes, for the app origin only. Everything else is refused.
- **No stealth.** The window is deliberately *not* protected from screen capture (`setContentProtection` is never called), so it appears in screen shares and recordings. The app does not try to evade interview-platform monitoring.

## Layout

```
src/main/main.ts       window, modes, tray, shortcut, permissions, display-media handler, IPC
src/main/policy.ts     pure rules: URL checks, permissions, geometry, tray text, payload validation
src/main/icons.ts      tray icons drawn in code (BGRA bitmaps)
src/preload/preload.ts contextBridge → window.desktop
tests/policy.test.ts   unit tests for policy.ts and icons.ts
```

## Tests

`npm test -w @aia/desktop` runs the policy unit tests. The renderer side is covered by `apps/client/src/test/desktop.test.tsx` with a fake bridge. The full shell has been checked end-to-end in real Electron over the DevTools protocol (hidden window, throwaway profile): isolation, bridge surface, navigation and pop-up blocking, sign-up, bubble/panel geometry, always-on-top, tray tooltip and answering a question.
