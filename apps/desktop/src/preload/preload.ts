/**
 * Preload (sandboxed): exposes ONLY the small, typed `window.desktop` bridge.
 * No Node.js, no Electron modules and no raw ipcRenderer reach the page.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CaptureActivity, CaptureSourceInfo, DesktopBridge, DesktopMode, DesktopState } from '@aia/shared' with { 'resolution-mode': 'import' };

function subscribe<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const bridge: DesktopBridge & { __e2eState?: () => Promise<unknown> } = {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('desktop:get-state') as Promise<DesktopState>,
  setMode: (mode: DesktopMode) => ipcRenderer.invoke('desktop:set-mode', mode) as Promise<DesktopState>,
  setAlwaysOnTop: (on: boolean) => ipcRenderer.invoke('desktop:set-always-on-top', on) as Promise<DesktopState>,
  hide: () => ipcRenderer.invoke('desktop:hide') as Promise<void>,
  // Passed through as-is: the main process validates strictly and ignores anything malformed
  // (coercing here would turn junk like "yes" into "capturing").
  reportCapture: (activity: CaptureActivity) =>
    ipcRenderer.send('desktop:capture', { screen: activity?.screen, microphone: activity?.microphone }),
  onPickSource: (cb) => subscribe<[string, CaptureSourceInfo[]]>('desktop:pick-source', cb),
  chooseSource: (requestId: string, sourceId: string | null) => ipcRenderer.send('desktop:choose-source', requestId, sourceId),
  onStateChange: (cb) => subscribe<[DesktopState]>('desktop:state', cb),
};

if (process.argv.includes('--aia-e2e')) {
  bridge.__e2eState = () => ipcRenderer.invoke('desktop:e2e-state');
}

contextBridge.exposeInMainWorld('desktop', bridge);
