import { describe, expect, it } from 'vitest';
import { circleBitmap, ICON_COLORS } from '../src/main/icons';
import {
  BUBBLE_SIZE,
  bubbleBoundsFromPanel,
  clampToWorkArea,
  defaultBubbleBounds,
  isAppUrl,
  isPermissionAllowed,
  isSafeExternalUrl,
  PANEL_SIZE,
  panelBoundsFromBubble,
  parseCaptureActivity,
  trayTooltip,
} from '../src/main/policy';

const APP = 'http://localhost:5173';
const area = { x: 0, y: 0, width: 1920, height: 1040 }; // 1080p minus a 40px taskbar

describe('navigation policy', () => {
  it('only treats the app origin as the app', () => {
    expect(isAppUrl('http://localhost:5173/desktop', APP)).toBe(true);
    expect(isAppUrl('http://localhost:5174/desktop', APP)).toBe(false);
    expect(isAppUrl('https://evil.example/?u=http://localhost:5173', APP)).toBe(false);
    expect(isAppUrl('not a url', APP)).toBe(false);
  });

  it('opens only plain https links externally', () => {
    expect(isSafeExternalUrl('https://developer.mozilla.org/')).toBe(true);
    for (const bad of ['http://example.com', 'file:///C:/Windows/System32', 'javascript:alert(1)', 'https://user:pass@example.com', 'smb://host/share']) {
      expect(isSafeExternalUrl(bad)).toBe(false);
    }
  });
});

describe('permission policy', () => {
  it('allows microphone, screen capture and clipboard write for the app only', () => {
    expect(isPermissionAllowed('media', `${APP}/desktop`, APP, { mediaTypes: ['audio'] })).toBe(true);
    expect(isPermissionAllowed('display-capture', `${APP}/desktop`, APP)).toBe(true);
    expect(isPermissionAllowed('clipboard-sanitized-write', `${APP}/desktop`, APP)).toBe(true);
    expect(isPermissionAllowed('media', 'https://evil.example/', APP, { mediaTypes: ['audio'] })).toBe(false);
  });

  it('never allows the camera or unrelated permissions', () => {
    expect(isPermissionAllowed('media', `${APP}/desktop`, APP, { mediaTypes: ['video'] })).toBe(false);
    expect(isPermissionAllowed('media', `${APP}/desktop`, APP, { mediaTypes: ['audio', 'video'] })).toBe(false);
    for (const p of ['geolocation', 'notifications', 'midi', 'usb', 'serial', 'hid', 'openExternal', 'clipboard-read']) {
      expect(isPermissionAllowed(p, `${APP}/desktop`, APP)).toBe(false);
    }
  });
});

describe('window geometry', () => {
  it('starts the bubble in the bottom-right corner, above the taskbar', () => {
    const b = defaultBubbleBounds(area);
    expect(b).toEqual({ width: BUBBLE_SIZE, height: BUBBLE_SIZE, x: 1920 - BUBBLE_SIZE - 16, y: 1040 - BUBBLE_SIZE - 16 });
  });

  it('opens the panel towards the middle of the screen and keeps it on-screen', () => {
    const bottomRight = defaultBubbleBounds(area);
    const p = panelBoundsFromBubble(bottomRight, area);
    expect(p.width).toBe(PANEL_SIZE.width);
    expect(p.x + p.width).toBe(bottomRight.x + bottomRight.width); // right edges aligned → opens leftwards
    expect(p.y + p.height).toBe(bottomRight.y + bottomRight.height); // opens upwards
    const topLeft = panelBoundsFromBubble({ x: 10, y: 10, width: BUBBLE_SIZE, height: BUBBLE_SIZE }, area);
    expect(topLeft).toMatchObject({ x: 10, y: 10 }); // opens right and down
  });

  it('round-trips bubble → panel → bubble to the same corner', () => {
    const bubble = defaultBubbleBounds(area);
    expect(bubbleBoundsFromPanel(panelBoundsFromBubble(bubble, area), area)).toEqual(bubble);
  });

  it('fits the panel on small screens and secondary monitors', () => {
    const small = { x: 0, y: 0, width: 400, height: 600 };
    const p = panelBoundsFromBubble({ x: 300, y: 500, width: BUBBLE_SIZE, height: BUBBLE_SIZE }, small);
    expect(p).toEqual({ x: 0, y: 0, width: 400, height: 600 });
    const second = { x: 1920, y: 0, width: 1280, height: 1000 };
    const q = panelBoundsFromBubble({ x: 1920 + 1200, y: 900, width: BUBBLE_SIZE, height: BUBBLE_SIZE }, second);
    expect(q.x).toBeGreaterThanOrEqual(1920);
    expect(q.x + q.width).toBeLessThanOrEqual(1920 + 1280);
  });

  it('pulls an off-screen window back into the work area', () => {
    expect(clampToWorkArea({ x: 5000, y: -200, width: 72, height: 72 }, area)).toEqual({ x: 1920 - 72, y: 0, width: 72, height: 72 });
  });
});

describe('tray', () => {
  it('describes what is being captured', () => {
    expect(trayTooltip({ screen: false, microphone: false })).toBe('Interview AI');
    expect(trayTooltip({ screen: true, microphone: false })).toBe('Interview AI — capturing screen');
    expect(trayTooltip({ screen: true, microphone: true })).toBe('Interview AI — capturing screen and microphone');
  });

  it('validates capture reports from the page', () => {
    expect(parseCaptureActivity({ screen: true, microphone: false })).toEqual({ screen: true, microphone: false });
    expect(parseCaptureActivity({ screen: 'yes', microphone: false })).toBeNull();
    expect(parseCaptureActivity(null)).toBeNull();
    expect(parseCaptureActivity('screen')).toBeNull();
  });

  it('draws an anti-aliased circle icon (BGRA)', () => {
    const size = 32;
    const bmp = circleBitmap(size, ICON_COLORS.capturing);
    expect(bmp.length).toBe(size * size * 4);
    const px = (x: number, y: number) => [...bmp.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
    expect(px(0, 0)[3]).toBe(0); // corner transparent
    const [b, g, r, a] = px(8, 16); // inside the circle, away from the centre dot
    expect([r, g, b, a]).toEqual([229, 57, 53, 255]);
    expect(px(16, 16).slice(0, 3)).toEqual([53, 57, 229]); // centre dot is the colour when not "recording"
    expect(circleBitmap(size, ICON_COLORS.capturing, true).subarray((16 * size + 16) * 4, (16 * size + 16) * 4 + 3)).toEqual(Buffer.from([255, 255, 255]));
  });
});
