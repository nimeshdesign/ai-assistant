import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import type { CaptureSourceInfo, DesktopMode, DesktopState } from '@aia/shared' with { 'resolution-mode': 'import' };
import { circleBitmap, ICON_COLORS } from './icons.js';
import {
  BUBBLE_SIZE,
  bubbleBoundsFromPanel,
  clampToWorkArea,
  defaultBubbleBounds,
  isAppUrl,
  isCapturing,
  isPermissionAllowed,
  isSafeExternalUrl,
  PANEL_SIZE,
  panelBoundsFromBubble,
  parseCaptureActivity,
  trayTooltip,
  type CaptureActivity,
} from './policy.js';

/** Where the web app is served. Dev: the Vite server. Production: your deployed web app. */
const APP_URL = (process.env.AIA_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const APP_ORIGIN = new URL(APP_URL).origin;
const ENTRY_URL = `${APP_URL}/desktop`;
const SHORTCUT = 'CommandOrControl+Shift+Space';
/** Automated checks only: keep the window off-screen and expose read-only state. */
const E2E = process.env.AIA_E2E === '1';

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
// Start expanded: a first-time user needs room to sign in. They can collapse it to the bubble.
let mode: DesktopMode = 'panel';
let alwaysOnTop = true;
let activity: CaptureActivity = { screen: false, microphone: false };
let quitting = false;
let currentTooltip = '';
const pendingPicks = new Map<string, (sourceId: string | null) => void>();

// ---------------------------------------------------------------- helpers

function state(): DesktopState {
  return { mode, alwaysOnTop, platform: process.platform, version: app.getVersion() };
}

function broadcastState() {
  win?.webContents.send('desktop:state', state());
  rebuildTrayMenu();
}

/** Only the web app's own pages may talk to the shell. */
function fromApp(e: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const url = e.senderFrame?.url;
  return !!url && isAppUrl(url, APP_ORIGIN);
}

function workAreaFor(bounds: Electron.Rectangle) {
  return screen.getDisplayMatching(bounds).workArea;
}

function showWindow() {
  if (!win) return;
  if (!E2E) win.show();
  win.focus();
}

function setMode(next: DesktopMode) {
  if (!win) return;
  const current = win.getBounds();
  const area = workAreaFor(current);
  if (next === 'panel' && mode === 'bubble') {
    win.setResizable(true);
    win.setMinimumSize(360, 480);
    win.setBounds(panelBoundsFromBubble(current, area));
  } else if (next === 'bubble' && mode === 'panel') {
    win.setMinimumSize(BUBBLE_SIZE, BUBBLE_SIZE);
    win.setBounds(bubbleBoundsFromPanel(current, area));
    win.setResizable(false);
  }
  mode = next;
  broadcastState();
}

function setAlwaysOnTop(on: boolean) {
  alwaysOnTop = on;
  // 'floating' keeps the assistant above normal windows without covering system UI.
  win?.setAlwaysOnTop(on, 'floating');
  broadcastState();
}

// ---------------------------------------------------------------- tray

function trayIcon(capturing: boolean) {
  const size = 32;
  const bitmap = circleBitmap(size, capturing ? ICON_COLORS.capturing : ICON_COLORS.idle, capturing);
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size, scaleFactor: 2 });
}

function rebuildTrayMenu() {
  currentTooltip = trayTooltip(activity);
  if (!tray) return;
  tray.setToolTip(currentTooltip);
  tray.setImage(trayIcon(isCapturing(activity)));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: isCapturing(activity) ? trayTooltip(activity).replace('Interview AI — ', '● ') : 'Not capturing', enabled: false },
      { type: 'separator' },
      { label: win?.isVisible() ? 'Hide assistant' : 'Show assistant', click: () => (win?.isVisible() ? win.hide() : showWindow()) },
      { label: 'Always on top', type: 'checkbox', checked: alwaysOnTop, click: (item) => setAlwaysOnTop(item.checked) },
      { type: 'separator' },
      {
        label: 'Quit Interview AI',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

// ---------------------------------------------------------------- window

/** Locked-down renderer: isolated context, OS sandbox, no Node.js in the page. */
const WEB_PREFERENCES: Electron.WebPreferences = {
  preload: path.join(__dirname, '..', 'preload', 'preload.js'),
  partition: 'persist:aia',
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  spellcheck: false,
  // Screen reading and voice timers must keep running while other apps have focus.
  backgroundThrottling: false,
  additionalArguments: E2E ? ['--aia-e2e'] : [],
};

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const ses = session.fromPartition('persist:aia');

  // Permissions: microphone, screen capture and clipboard write — only for the app itself.
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(isPermissionAllowed(permission, details.requestingUrl ?? wc.getURL(), APP_ORIGIN, details as { mediaTypes?: string[] }));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => isPermissionAllowed(permission, requestingOrigin, APP_ORIGIN));

  // Screen sharing: the user picks a screen or window in our own picker inside the panel.
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!win || !request.frame || !isAppUrl(request.frame.url, APP_ORIGIN) || !request.videoRequested) return callback(null);
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } });
    const own = win.getMediaSourceId();
    const offered: CaptureSourceInfo[] = sources
      .filter((s) => s.id !== own) // sharing the assistant with itself is pointless
      .map((s) => ({ id: s.id, name: s.name, kind: s.id.startsWith('screen:') ? 'screen' : 'window', thumbnail: s.thumbnail.toDataURL() }));
    const requestId = randomUUID();
    if (mode === 'bubble') setMode('panel');
    showWindow();
    const chosen = await new Promise<string | null>((resolve) => {
      pendingPicks.set(requestId, resolve);
      win!.webContents.send('desktop:pick-source', requestId, offered);
      setTimeout(() => pendingPicks.get(requestId)?.(null), 120_000); // nobody chose: cancel
    });
    pendingPicks.delete(requestId);
    const source = sources.find((s) => s.id === chosen && s.id !== own);
    callback(source ? { video: source } : null);
  });

  win = new BrowserWindow({
    ...panelBoundsFromBubble(defaultBubbleBounds(area), area),
    minWidth: 360,
    minHeight: 480,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop,
    hasShadow: false,
    show: false,
    skipTaskbar: false,
    title: 'Interview AI',
    backgroundColor: '#00000000',
    webPreferences: WEB_PREFERENCES,
  });
  win.setAlwaysOnTop(alwaysOnTop, 'floating');
  // NOTE: deliberately NOT calling win.setContentProtection(true). The assistant stays visible
  // in screen shares and recordings; it must never be used to hide assistance (see docs).

  // Navigation is pinned to the app; external https links open in the user's browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (isAppUrl(url, APP_ORIGIN)) return;
    e.preventDefault();
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  });
  win.webContents.on('will-redirect', (e, url) => {
    if (!isAppUrl(url, APP_ORIGIN)) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());

  // Anything other than the compact /desktop view (e.g. sign-in after a session expired)
  // needs the full panel, never the 72px bubble.
  const ensurePanelFor = (url: string) => {
    if (mode === 'bubble' && isAppUrl(url, APP_ORIGIN) && !new URL(url).pathname.startsWith('/desktop')) setMode('panel');
  };
  win.webContents.on('did-navigate', (_e, url) => ensurePanelFor(url));
  win.webContents.on('did-navigate-in-page', (_e, url) => ensurePanelFor(url));

  // If the web app can't be reached, show a short message and keep retrying.
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted */ || !url.startsWith(APP_URL)) return;
    const html = `<body style="font:14px system-ui;margin:0;display:grid;place-items:center;height:100vh;background:#fff;border-radius:12px">
      <div style="text-align:center;padding:16px"><b>Can't reach Interview AI</b><br><small>${APP_URL.replace(/[<>&"]/g, '')}<br>Retrying…</small></div></body>`;
    void win?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    setTimeout(() => void win?.loadURL(ENTRY_URL), 5000);
  });

  win.once('ready-to-show', () => showWindow());
  win.on('close', (e) => {
    // Closing hides to the tray; "Quit" in the tray menu really exits.
    if (!quitting) {
      e.preventDefault();
      win?.hide();
      rebuildTrayMenu();
    }
  });
  win.on('show', rebuildTrayMenu);
  win.on('hide', rebuildTrayMenu);
  // Keep the bubble on-screen after display changes (monitor unplugged, resolution change).
  screen.on('display-metrics-changed', () => win && win.setBounds(clampToWorkArea(win.getBounds(), workAreaFor(win.getBounds()))));

  void win.loadURL(ENTRY_URL);
}

// ---------------------------------------------------------------- IPC

ipcMain.handle('desktop:get-state', (e) => (fromApp(e) ? state() : null));
ipcMain.handle('desktop:set-mode', (e, next: unknown) => {
  if (fromApp(e) && (next === 'bubble' || next === 'panel')) setMode(next);
  return state();
});
ipcMain.handle('desktop:set-always-on-top', (e, on: unknown) => {
  if (fromApp(e) && typeof on === 'boolean') setAlwaysOnTop(on);
  return state();
});
ipcMain.handle('desktop:hide', (e) => {
  if (fromApp(e)) win?.hide();
});
ipcMain.on('desktop:capture', (e, input: unknown) => {
  const next = fromApp(e) ? parseCaptureActivity(input) : null;
  if (!next) return;
  activity = next;
  rebuildTrayMenu();
});
ipcMain.on('desktop:choose-source', (e, requestId: unknown, sourceId: unknown) => {
  if (!fromApp(e) || typeof requestId !== 'string') return;
  pendingPicks.get(requestId)?.(typeof sourceId === 'string' ? sourceId : null);
});
if (E2E) {
  // Read-only view of shell state for automated checks.
  ipcMain.handle('desktop:e2e-state', (e) =>
    fromApp(e) && win
      ? {
          ...state(),
          bounds: win.getBounds(),
          visible: win.isVisible(),
          isAlwaysOnTop: win.isAlwaysOnTop(),
          contentProtected: win.isContentProtected(),
          trayTooltip: currentTooltip,
          webPreferences: {
            contextIsolation: WEB_PREFERENCES.contextIsolation,
            sandbox: WEB_PREFERENCES.sandbox,
            nodeIntegration: WEB_PREFERENCES.nodeIntegration,
          },
        }
      : null,
  );
}

// ---------------------------------------------------------------- lifecycle

// Optional separate profile folder (used by automated checks; also handy for testing).
if (process.env.AIA_USER_DATA) app.setPath('userData', process.env.AIA_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(() => {
    createWindow();
    // Automated checks must not add a tray icon or grab a system-wide shortcut on the user's desktop.
    if (!E2E) {
      tray = new Tray(trayIcon(false));
      tray.on('click', () => (win?.isVisible() ? win.hide() : showWindow()));
      globalShortcut.register(SHORTCUT, () => (win?.isVisible() ? win.hide() : showWindow()));
    }
    rebuildTrayMenu();
  });
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
