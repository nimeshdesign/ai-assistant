import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// Register jest-dom matchers on this exact `expect` instance (the side-effect import can bind to a different one).
expect.extend(matchers);

// Lazy route chunks are compiled on first use in tests; give async queries some headroom.
configure({ asyncUtilTimeout: 6000 });

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  // Health endpoint used by the top-bar API status.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ success: true, data: { status: 'ok', db: 'connected', uptimeSec: 1, version: '0.1.0' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---- jsdom gaps used by Radix, cmdk and Recharts ----
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

Element.prototype.scrollIntoView ??= function () {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
