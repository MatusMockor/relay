// @vitest-environment jsdom
import type { UpdateStatus } from '@relay/shared';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPDATE_CHECK_FEEDBACK_MS } from '../src/features/updates/use-update-check';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import type { Platform } from '../src/platform/Platform';
import { setUi } from '../src/state/ui-store';
import { demoClient } from './features-support';
import { renderApp, resetStores, storageWith } from './support/render-app';

const CHECK = 'Skontrolovať aktualizácie';
const VERSION = 'Relay 0.1.6';

const updatablePlatform = (initial: UpdateStatus) => {
  const listeners = new Set<(status: UpdateStatus) => void>();
  let current = initial;
  let checks = 0;
  const platform: Platform = {
    ...createBrowserPlatform(storageWith({ mode: 'local' })),
    appInfo: () =>
      Promise.resolve({
        name: 'Relay',
        version: '0.1.6',
        platform: 'macos',
        electronVersion: '38.0.0',
        isPackaged: true,
      }),
    subscribeToUpdates: (listener) => {
      listeners.add(listener);
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
    checkForUpdates: () => {
      checks += 1;
      return Promise.resolve();
    },
  };
  const emit = (status: UpdateStatus) => {
    current = status;
    act(() => {
      listeners.forEach((listener) => {
        listener(status);
      });
    });
  };
  return { platform, emit, checks: () => checks };
};

const renderFooter = async (initial: UpdateStatus) => {
  const driver = updatablePlatform(initial);
  setUi({ leftUser: true });
  renderApp({ demo: demoClient, platform: driver.platform });
  const sidebar = await screen.findByRole('navigation', { name: 'Priečinky' });
  await within(sidebar).findByRole('button', { name: VERSION });
  return { ...driver, sidebar };
};

const checkButton = (sidebar: HTMLElement) =>
  within(sidebar).queryByRole('button', { name: CHECK });

const clickCheck = async (sidebar: HTMLElement) => {
  const button = within(sidebar).getByRole('button', { name: CHECK });
  await act(async () => {
    fireEvent.click(button);
    await Promise.resolve();
  });
};

describe('sidebar update check', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetStores();
  });

  it('offers the check only when the update status allows it', async () => {
    const { sidebar, emit } = await renderFooter({ kind: 'disabled', reason: 'development' });

    expect(checkButton(sidebar)).toBeNull();

    emit({ kind: 'idle' });
    expect(checkButton(sidebar)?.getAttribute('title')).toBe(CHECK);

    emit({ kind: 'downloading', version: '0.1.7', percent: 10 });
    expect(checkButton(sidebar)).toBeNull();
    expect(within(sidebar).getByRole('button', { name: 'Sťahujem 10 %' })).toBeDefined();
  });

  it('keeps the version label opening the about section', async () => {
    const { sidebar } = await renderFooter({ kind: 'idle' });

    act(() => {
      fireEvent.click(within(sidebar).getByRole('button', { name: VERSION }));
    });

    const sheet = screen.getByRole('dialog', { name: 'Nastavenia' });
    expect(
      within(sheet).getByRole('tab', { name: 'O aplikácii' }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('asks the platform for a check and disables the button while it runs', async () => {
    const { sidebar, emit, checks } = await renderFooter({ kind: 'idle' });

    await clickCheck(sidebar);
    expect(checks()).toBe(1);

    emit({ kind: 'checking' });
    const button = checkButton(sidebar);
    expect(button?.hasAttribute('disabled')).toBe(true);
    expect(button?.classList.contains('spinning')).toBe(true);
    expect(within(sidebar).getByRole('button', { name: VERSION })).toBeDefined();
  });

  it('confirms an up to date version for a moment and then shows the version again', async () => {
    const { sidebar, emit } = await renderFooter({ kind: 'idle' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await clickCheck(sidebar);
    emit({ kind: 'checking' });
    emit({ kind: 'current', checkedAt: new Date().toISOString() });

    expect(within(sidebar).getByRole('button', { name: 'Máš najnovšiu verziu' })).toBeDefined();
    expect(within(sidebar).getByRole('status').textContent).toBe('Máš najnovšiu verziu');
    expect(checkButton(sidebar)?.hasAttribute('disabled')).toBe(false);

    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_FEEDBACK_MS - 1);
    });
    expect(within(sidebar).getByRole('button', { name: 'Máš najnovšiu verziu' })).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(within(sidebar).queryByRole('button', { name: 'Máš najnovšiu verziu' })).toBeNull();
    expect(within(sidebar).getByRole('button', { name: VERSION })).toBeDefined();
    expect(within(sidebar).getByRole('status').textContent).toBe('');
  });

  it('does not confirm a check the user did not ask for', async () => {
    const { sidebar, emit } = await renderFooter({ kind: 'idle' });

    emit({ kind: 'checking' });
    emit({ kind: 'current', checkedAt: new Date().toISOString() });

    expect(within(sidebar).getByRole('button', { name: VERSION })).toBeDefined();
    expect(within(sidebar).queryByRole('button', { name: 'Máš najnovšiu verziu' })).toBeNull();
  });

  it('tells briefly when the requested check fails', async () => {
    const { sidebar, emit } = await renderFooter({
      kind: 'current',
      checkedAt: new Date().toISOString(),
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await clickCheck(sidebar);
    emit({ kind: 'checking' });
    emit({ kind: 'error', failed: 'check' });

    expect(
      within(sidebar).getByRole('button', { name: 'Kontrola aktualizácií zlyhala' }),
    ).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_FEEDBACK_MS);
    });
    expect(within(sidebar).getByRole('button', { name: VERSION })).toBeDefined();
  });

  it('hands over to the download progress when an update is found', async () => {
    const { sidebar, emit } = await renderFooter({ kind: 'idle' });

    await clickCheck(sidebar);
    emit({ kind: 'checking' });
    emit({ kind: 'downloading', version: '0.1.7', percent: 0 });

    expect(within(sidebar).getByRole('button', { name: 'Sťahujem 0 %' })).toBeDefined();
    expect(checkButton(sidebar)).toBeNull();
  });
});
