/**
 * Contract between the Electron desktop shell (apps/desktop) and the web app running inside it.
 * The preload script exposes exactly this object as `window.desktop`; nothing else from
 * Electron or Node is reachable from the page.
 */

export type DesktopMode = 'bubble' | 'panel';

export interface DesktopState {
  mode: DesktopMode;
  alwaysOnTop: boolean;
  platform: string;
  version: string;
}

/** A screen or window the user can choose to share (thumbnail as a data: URL). */
export interface CaptureSourceInfo {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string;
}

export interface CaptureActivity {
  screen: boolean;
  microphone: boolean;
}

export interface DesktopBridge {
  readonly platform: string;
  getState(): Promise<DesktopState>;
  setMode(mode: DesktopMode): Promise<DesktopState>;
  setAlwaysOnTop(on: boolean): Promise<DesktopState>;
  /** Hide to the tray (the app keeps running; the tray or shortcut brings it back). */
  hide(): Promise<void>;
  /** Tell the shell what is being captured so the tray icon can show it. */
  reportCapture(activity: CaptureActivity): void;
  /** The shell asks the page to let the user pick what to share. Returns an unsubscribe function. */
  onPickSource(cb: (requestId: string, sources: CaptureSourceInfo[]) => void): () => void;
  /** Answer a pick request: a source id, or null to cancel. */
  chooseSource(requestId: string, sourceId: string | null): void;
  /** State changed from outside the page (e.g. tray menu). Returns an unsubscribe function. */
  onStateChange(cb: (state: DesktopState) => void): () => void;
}

export const DESKTOP_SHORTCUT = 'CommandOrControl+Shift+Space';
