import type { DesktopBridge } from '@aia/shared';

declare global {
  interface Window {
    /** Present only inside the Electron desktop app (see apps/desktop/src/preload). */
    desktop?: DesktopBridge;
  }
}

/** The desktop shell bridge, or undefined in a normal browser. */
export const getDesktop = (): DesktopBridge | undefined => (typeof window !== 'undefined' ? window.desktop : undefined);
export const isDesktopApp = () => !!getDesktop();
