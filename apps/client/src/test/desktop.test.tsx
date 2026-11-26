import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureSourceInfo, DesktopBridge, DesktopState } from '@aia/shared';
import { createFakeApi } from './fakeApi';
import { installFakeMedia } from './fakeMedia';
import { renderApp } from './utils';

/** In-memory stand-in for the Electron preload bridge. */
function installFakeBridge() {
  let state: DesktopState = { mode: 'panel', alwaysOnTop: true, platform: 'win32', version: '0.1.0' };
  const stateListeners = new Set<(s: DesktopState) => void>();
  const pickListeners = new Set<(id: string, sources: CaptureSourceInfo[]) => void>();
  const bridge = {
    platform: 'win32',
    getState: vi.fn(async () => state),
    setMode: vi.fn(async (mode: DesktopState['mode']) => (state = { ...state, mode })),
    setAlwaysOnTop: vi.fn(async (on: boolean) => (state = { ...state, alwaysOnTop: on })),
    hide: vi.fn(async () => {}),
    reportCapture: vi.fn(),
    onPickSource: (cb: (id: string, s: CaptureSourceInfo[]) => void) => {
      pickListeners.add(cb);
      return () => pickListeners.delete(cb);
    },
    chooseSource: vi.fn(),
    onStateChange: (cb: (s: DesktopState) => void) => {
      stateListeners.add(cb);
      return () => stateListeners.delete(cb);
    },
  } satisfies DesktopBridge;
  window.desktop = bridge;
  return {
    bridge,
    /** Simulate the shell (e.g. the tray menu) changing state. */
    pushState: (patch: Partial<DesktopState>) => {
      state = { ...state, ...patch };
      stateListeners.forEach((l) => l(state));
    },
    /** Simulate the shell asking the page to pick a screen/window. */
    askToPick: (id: string, sources: CaptureSourceInfo[]) => pickListeners.forEach((l) => l(id, sources)),
  };
}

const thumb = 'data:image/png;base64,iVBORw0KGgo=';
const SOURCES: CaptureSourceInfo[] = [
  { id: 'screen:0:0', name: 'Entire screen', kind: 'screen', thumbnail: thumb },
  { id: 'window:42:0', name: 'Interview Board — Chrome', kind: 'window', thumbnail: thumb },
];

describe('Desktop assistant (inside Electron)', () => {
  let shell: ReturnType<typeof installFakeBridge>;
  beforeEach(() => {
    shell = installFakeBridge();
  });
  afterEach(() => {
    delete window.desktop;
    document.documentElement.classList.remove('desktop-shell');
  });

  it('renders the compact panel without the app sidebar, on a transparent page', async () => {
    renderApp('/desktop');
    expect(await screen.findByRole('tab', { name: 'Screen' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Voice' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ask' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Primary' })).not.toBeInTheDocument();
    expect(document.documentElement).toHaveClass('desktop-shell');
    expect(screen.queryByText(/Preview of the desktop assistant/)).not.toBeInTheDocument();
  });

  it('collapses to the bubble and expands again', async () => {
    const { user } = renderApp('/desktop');
    await user.click(await screen.findByRole('button', { name: 'Collapse to bubble' }));
    expect(shell.bridge.setMode).toHaveBeenCalledWith('bubble');
    await user.click(await screen.findByRole('button', { name: 'Open assistant' }));
    expect(shell.bridge.setMode).toHaveBeenLastCalledWith('panel');
    expect(await screen.findByRole('tab', { name: 'Screen' })).toBeInTheDocument();
  });

  it('toggles always-on-top and hides to the tray', async () => {
    const { user } = renderApp('/desktop');
    const pin = await screen.findByRole('button', { name: 'Keep on top' });
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    await user.click(pin);
    expect(shell.bridge.setAlwaysOnTop).toHaveBeenCalledWith(false);
    await waitFor(() => expect(pin).toHaveAttribute('aria-pressed', 'false'));
    await user.click(screen.getByRole('button', { name: 'Hide to tray' }));
    expect(shell.bridge.hide).toHaveBeenCalled();
  });

  it('follows state changes made from the tray menu', async () => {
    renderApp('/desktop');
    const pin = await screen.findByRole('button', { name: 'Keep on top' });
    act(() => shell.pushState({ alwaysOnTop: false }));
    await waitFor(() => expect(pin).toHaveAttribute('aria-pressed', 'false'));
    act(() => shell.pushState({ mode: 'bubble' }));
    expect(await screen.findByRole('button', { name: 'Open assistant' })).toBeInTheDocument();
  });

  it('lets the user pick what to share, or cancel', async () => {
    const { user } = renderApp('/desktop');
    await screen.findByRole('tab', { name: 'Screen' });

    act(() => shell.askToPick('req-1', SOURCES));
    const dialog = await screen.findByRole('dialog', { name: 'Choose what to share' });
    expect(within(dialog).getByRole('listbox', { name: 'Screens' })).toBeInTheDocument();
    const share = within(dialog).getByRole('button', { name: 'Share' });
    expect(share).toBeDisabled(); // nothing is shared until the user chooses
    await user.click(within(dialog).getByRole('option', { name: /Interview Board/ }));
    await user.click(share);
    expect(shell.bridge.chooseSource).toHaveBeenCalledWith('req-1', 'window:42:0');

    act(() => shell.askToPick('req-2', SOURCES));
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Cancel' }));
    expect(shell.bridge.chooseSource).toHaveBeenLastCalledWith('req-2', null);
  });

  it('reports microphone use to the shell (tray indicator) and keeps recording across tabs', async () => {
    const media = installFakeMedia();
    const api = createFakeApi();
    api.seedSignedInUser().settings.permissions.microphone = true;
    const { user } = renderApp('/desktop', { api });

    await user.click(await screen.findByRole('tab', { name: 'Voice' }));
    await user.click(screen.getByRole('button', { name: 'Start listening' }));
    media.mic.level = 0.3;
    await waitFor(() => expect(shell.bridge.reportCapture).toHaveBeenLastCalledWith({ screen: false, microphone: true }));
    expect(screen.getAllByText('Microphone capture on').length).toBeGreaterThan(0); // header + mic control

    // Switching tabs must not stop the recording.
    await user.click(screen.getByRole('tab', { name: 'Ask' }));
    expect(media.mic.active).toBe(true);
    await user.click(screen.getByRole('tab', { name: 'Voice' }));
    await user.click(screen.getByRole('button', { name: 'Stop listening' }));
    await waitFor(() => expect(shell.bridge.reportCapture).toHaveBeenLastCalledWith({ screen: false, microphone: false }));
    expect(await screen.findByText(/Direct answer to: What is a closure in JavaScript\?/)).toBeInTheDocument();
  });

  it('sends signed-out users to sign in, then back to the desktop view', async () => {
    const api = createFakeApi();
    api.seedUser();
    const { user, router } = renderApp('/desktop', { signedIn: false, api });
    await screen.findByLabelText('Email');
    expect(router.state.location.search).toBe('?next=%2Fdesktop');
    await user.type(screen.getByLabelText('Email'), 'asha@example.com');
    await user.type(screen.getByLabelText('Password'), 'Sup3rSecret!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('tab', { name: 'Screen' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/desktop');
  });
});

describe('Desktop assistant (browser preview)', () => {
  it('works as a preview without the shell', async () => {
    const { user } = renderApp('/desktop');
    expect(await screen.findByText(/Preview of the desktop assistant/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide to tray' })).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass('desktop-shell');
    await user.click(screen.getByRole('button', { name: 'Collapse to bubble' }));
    expect(await screen.findByRole('button', { name: 'Open assistant' })).toBeInTheDocument();
  });
});
