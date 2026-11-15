// @vitest-environment jsdom
import type { DeviceSettings } from '@relay/shared';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import type { Platform } from '../src/platform/Platform';
import { useSessionStore } from '../src/session/session-store';
import { gate, settle } from './features-support';
import { memoryStorage, renderApp, resetStores } from './support/render-app';

describe('welcome step', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('ignores the server option while continuing without an account', async () => {
    const base = createBrowserPlatform(memoryStorage());
    const held = gate();
    const platform: Platform = {
      ...base,
      updateDeviceSettings: async (patch: Partial<DeviceSettings>) => {
        if (patch.mode === 'local') {
          await held.wait();
        }
        return base.updateDeviceSettings(patch);
      },
    };
    renderApp({ platform });
    const offline = await screen.findByRole('button', { name: /Pokračovať bez účtu/ });
    act(() => {
      fireEvent.click(offline);
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Pripojiť k serveru/ }));
    });
    expect(useSessionStore.getState().step).toBe('welcome');
    held.open();
    await settle();
    expect(useSessionStore.getState().phase).not.toBe('onboarding');
  });
});
