import { useCallback, useEffect, useState } from 'react';
import type { CaptureActivity, DesktopMode, DesktopState } from '@aia/shared';
import { getDesktop } from '@/lib/desktop';

const BROWSER_PREVIEW: DesktopState = { mode: 'panel', alwaysOnTop: false, platform: 'web', version: 'preview' };

/**
 * Desktop shell state and actions. Inside Electron everything goes through the preload bridge;
 * in a normal browser the same UI runs as a local preview (no floating window).
 */
export function useDesktopShell() {
  const bridge = getDesktop();
  const [state, setState] = useState<DesktopState>(BROWSER_PREVIEW);

  useEffect(() => {
    if (!bridge) return;
    let alive = true;
    void bridge.getState().then((s) => alive && s && setState(s));
    const off = bridge.onStateChange(setState);
    return () => {
      alive = false;
      off();
    };
  }, [bridge]);

  // Transparent page background so the frameless window can be round / have a shadow.
  useEffect(() => {
    if (!bridge) return;
    document.documentElement.classList.add('desktop-shell');
    return () => document.documentElement.classList.remove('desktop-shell');
  }, [bridge]);

  const setMode = useCallback(
    async (mode: DesktopMode) => setState(bridge ? await bridge.setMode(mode) : (s) => ({ ...s, mode })),
    [bridge],
  );
  const setAlwaysOnTop = useCallback(
    async (on: boolean) => setState(bridge ? await bridge.setAlwaysOnTop(on) : (s) => ({ ...s, alwaysOnTop: on })),
    [bridge],
  );
  const hide = useCallback(() => void bridge?.hide(), [bridge]);
  const reportCapture = useCallback((a: CaptureActivity) => bridge?.reportCapture(a), [bridge]);

  return { inDesktop: !!bridge, state, setMode, setAlwaysOnTop, hide, reportCapture };
}
