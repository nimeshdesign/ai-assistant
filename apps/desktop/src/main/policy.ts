/**
 * Pure decision logic for the desktop shell (no Electron imports), so it can be unit-tested.
 */

// ---------------- Navigation & permissions ----------------

/** True for URLs on the web app's own origin. */
export function isAppUrl(url: string, appOrigin: string): boolean {
  try {
    return new URL(url).origin === appOrigin;
  } catch {
    return false;
  }
}

/** External links may open in the user's browser — but only plain https URLs. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

/**
 * Permissions the app may use, and only from its own origin:
 * microphone (voice), screen capture (screen assistant) and clipboard write (copy buttons).
 * Everything else — camera via `media` video is filtered separately, geolocation,
 * notifications, MIDI, USB, etc. — is denied.
 */
const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture', 'clipboard-sanitized-write']);

export function isPermissionAllowed(
  permission: string,
  requestingUrl: string,
  appOrigin: string,
  details: { mediaTypes?: string[] } = {},
): boolean {
  if (!ALLOWED_PERMISSIONS.has(permission) || !isAppUrl(requestingUrl, appOrigin)) return false;
  // The app never needs the camera.
  if (permission === 'media' && details.mediaTypes?.includes('video')) return false;
  return true;
}

// ---------------- Window geometry ----------------

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const BUBBLE_SIZE = 72;
export const PANEL_SIZE = { width: 440, height: 720 };
const MARGIN = 16;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/** Keep a rectangle fully inside the work area (the screen minus taskbar/dock). */
export function clampToWorkArea(r: Rect, area: Rect): Rect {
  const width = Math.min(r.width, area.width);
  const height = Math.min(r.height, area.height);
  return {
    width,
    height,
    x: clamp(r.x, area.x, area.x + area.width - width),
    y: clamp(r.y, area.y, area.y + area.height - height),
  };
}

/** Default bubble position: bottom-right corner of the work area. */
export function defaultBubbleBounds(area: Rect): Rect {
  return {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    x: area.x + area.width - BUBBLE_SIZE - MARGIN,
    y: area.y + area.height - BUBBLE_SIZE - MARGIN,
  };
}

/**
 * Expand: open the panel next to the bubble — towards the middle of the screen, so it opens
 * leftwards from a bubble on the right edge and upwards from one at the bottom.
 */
export function panelBoundsFromBubble(bubble: Rect, area: Rect, size = PANEL_SIZE): Rect {
  const bubbleCenterX = bubble.x + bubble.width / 2;
  const bubbleCenterY = bubble.y + bubble.height / 2;
  const onRight = bubbleCenterX > area.x + area.width / 2;
  const onBottom = bubbleCenterY > area.y + area.height / 2;
  const x = onRight ? bubble.x + bubble.width - size.width : bubble.x;
  const y = onBottom ? bubble.y + bubble.height - size.height : bubble.y;
  return clampToWorkArea({ x, y, width: size.width, height: size.height }, area);
}

/** Collapse: put the bubble at the panel's corner nearest the screen edge it came from. */
export function bubbleBoundsFromPanel(panel: Rect, area: Rect): Rect {
  const onRight = panel.x + panel.width / 2 > area.x + area.width / 2;
  const onBottom = panel.y + panel.height / 2 > area.y + area.height / 2;
  const x = onRight ? panel.x + panel.width - BUBBLE_SIZE : panel.x;
  const y = onBottom ? panel.y + panel.height - BUBBLE_SIZE : panel.y;
  return clampToWorkArea({ x, y, width: BUBBLE_SIZE, height: BUBBLE_SIZE }, area);
}

// ---------------- Tray ----------------

export interface CaptureActivity {
  screen: boolean;
  microphone: boolean;
}

export function trayTooltip(activity: CaptureActivity): string {
  const parts = [activity.screen && 'screen', activity.microphone && 'microphone'].filter(Boolean);
  return parts.length ? `Interview AI — capturing ${parts.join(' and ')}` : 'Interview AI';
}

export function isCapturing(activity: CaptureActivity) {
  return activity.screen || activity.microphone;
}

/** Validate untrusted IPC input from the renderer. */
export function parseCaptureActivity(input: unknown): CaptureActivity | null {
  if (!input || typeof input !== 'object') return null;
  const { screen, microphone } = input as Record<string, unknown>;
  if (typeof screen !== 'boolean' || typeof microphone !== 'boolean') return null;
  return { screen, microphone };
}
