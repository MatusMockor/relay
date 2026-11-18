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
const UP_TO_DATE = 'Máš najnovšiu verziu';
const VERSION = 'Relay 0.1.6';
const NOW = new Date('2026-11-18T14:05:00.000Z');
const TWELVE_MINUTES_AGO = '2026-11-18T13:53:00.000Z';

const updatablePlatform = (initial: UpdateStatus) => {
  const listeners = new Set<(status: UpdateStatus) => void>();
  let current = initial;
  let checks = 0;
  let installs = 0;
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
    installUpdate: () => {
      installs += 1;
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
  return { platform, emit, checks: () => checks, installs: () => installs };
};

const renderFooter = async (initial: UpdateStatus) => {
  const driver = updatablePlatform(initial);
  setUi({ leftUser: true });
  renderApp({ demo: demoClient, platform: driver.platform, now: () => NOW });
  const sidebar = await screen.findByRole('navigation', { name: 'Priečinky' });
  await within(sidebar).findByRole('button', { name: VERSION });
  return { ...driver, sidebar };
};

const updateButton = (sidebar: HTMLElement): HTMLElement | null =>
  sidebar.querySelector<HTMLElement>('.upd-btn');

const tooltipText = (sidebar: HTMLElement): string | null =>
  within(sidebar).queryByRole('tooltip', { hidden: true })?.textContent ?? null;

const click = async (button: HTMLElement) => {
  await act(async () => {
    fireEvent.click(button);
    await Promise.resolve();
  });
};

const clickCheck = async (sidebar: HTMLElement) => {
  await click(within(sidebar).getByRole('button', { name: CHECK }));
};

describe('sidebar update button', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetStores();
  });

  it('hides the button when updates are off and keeps the version label', async () => {
    const { sidebar, emit } = await renderFooter({ kind: 'disabled', reason: 'development' });

    expect(updateButton(sidebar)).toBeNull();
    expect(within(sidebar).getByRole('button', { name: VERSION })).toBeDefined();

    emit({ kind: 'idle' });
    expect(within(sidebar).getByRole('button', { name: CHECK })).toBeDefined();
    expect(tooltipText(sidebar)).toBe(CHECK);

    emit({ kind: 'disabled', reason: 'manual-package' });
    expect(updateButton(sidebar)).toBeNull();
    expect(within(sidebar).getByRole('button', { name: VERSION })).toBeDefined();
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

  it('tells when the last check ran', async () => {
    const { sidebar } = await renderFooter({ kind: 'current', checkedAt: TWELVE_MINUTES_AGO });

    const button = within(sidebar).getByRole('button', {
      name: CHECK,
      description: 'Naposledy pred 12 min',
    });
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(tooltipText(sidebar)).toBe(`${CHECK}Naposledy pred 12 min`);
  });

  it('asks the platform for a check and disables the button while it runs', async () => {
    const { sidebar, emit, checks } = await renderFooter({ kind: 'idle' });

    await clickCheck(sidebar);
    expect(checks()).toBe(1);

    emit({ kind: 'checking' });
    const button = within(sidebar).getByRole('button', { name: 'Kontrolujem aktualizácie…' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.classList.contains('checking')).toBe(true);
    expect(within(sidebar).getByRole('button', { name: VERSION })).toBeDefined();
  });

  it('confirms an up to date version for 3 seconds and then offers the check again', async () => {
    const { sidebar, emit } = await renderFooter({ kind: 'idle' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await clickCheck(sidebar);
    emit({ kind: 'checking' });
    emit({ kind: 'current', checkedAt: TWELVE_MINUTES_AGO });

    const confirmed = within(sidebar).getByRole('button', { name: UP_TO_DATE });
    expect(confirmed.classList.contains('checked')).toBe(true);
    expect(tooltipText(sidebar)).toBe(UP_TO_DATE);
    expect(within(sidebar).getByRole('status').textContent).toBe(UP_TO_DATE);
    expect(within(sidebar).getByRole('button', { name: VERSION })).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_FEEDBACK_MS - 1);
    });
    expect(within(sidebar).getByRole('button', { name: UP_TO_DATE })).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(within(sidebar).queryByRole('button', { name: UP_TO_DATE })).toBeNull();
    expect(
      within(sidebar).getByRole('button', { name: CHECK, description: 'Naposledy pred 12 min' }),
    ).toBeDefined();
    expect(within(sidebar).getByRole('status').textContent).toBe('');
    expect(UPDATE_CHECK_FEEDBACK_MS).toBe(3000);
  });

  it('keeps background checks silent', async () => {
    const { sidebar, emit } = await renderFooter({ kind: 'idle' });

    emit({ kind: 'checking' });
    emit({ kind: 'current', checkedAt: TWELVE_MINUTES_AGO });

    expect(within(sidebar).queryByRole('button', { name: UP_TO_DATE })).toBeNull();
    expect(within(sidebar).getByRole('button', { name: CHECK })).toBeDefined();
    expect(within(sidebar).getByRole('status').textContent).toBe('');
  });

  it('shows the download progress in a ring and ignores clicks', async () => {
    const { sidebar, emit, checks, installs } = await renderFooter({ kind: 'idle' });

    await clickCheck(sidebar);
    emit({ kind: 'checking' });
    emit({ kind: 'downloading', version: '0.1.7', percent: 42 });

    const button = within(sidebar).getByRole('button', {
      name: 'Sťahujem verziu 0.1.7',
      description: '42 %',
    });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(tooltipText(sidebar)).toBe('Sťahujem verziu 0.1.742 %');
    const bar = button.querySelector('.upd-ring-bar');
    const length = Number(bar?.getAttribute('stroke-dasharray'));
    expect(Number(bar?.getAttribute('stroke-dashoffset'))).toBeCloseTo(length * 0.58);

    await click(button);
    expect(checks()).toBe(1);
    expect(installs()).toBe(0);
  });

  it('restarts into the ready update', async () => {
    const { sidebar, installs } = await renderFooter({ kind: 'ready', version: '0.1.7' });

    const button = within(sidebar).getByRole('button', {
      name: 'Reštartovať a aktualizovať',
      description: 'Verzia 0.1.7 je pripravená',
    });
    expect(button.classList.contains('ready')).toBe(true);
    expect(button.querySelector('.upd-badge')).not.toBeNull();

    await click(button);
    expect(installs()).toBe(1);
  });

  it('retries the check after a failure', async () => {
    const { sidebar, checks } = await renderFooter({ kind: 'error', failed: 'check' });

    const button = within(sidebar).getByRole('button', {
      name: 'Kontrola aktualizácií zlyhala',
      description: 'Klikni a skús to znova',
    });
    expect(button.classList.contains('error')).toBe(true);

    await click(button);
    expect(checks()).toBe(1);
  });

  it('announces a failed requested check for a moment', async () => {
    const { sidebar, emit } = await renderFooter({
      kind: 'current',
      checkedAt: TWELVE_MINUTES_AGO,
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await clickCheck(sidebar);
    emit({ kind: 'checking' });
    emit({ kind: 'error', failed: 'check' });

    expect(within(sidebar).getByRole('status').textContent).toBe('Kontrola aktualizácií zlyhala');

    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_FEEDBACK_MS);
    });
    expect(within(sidebar).getByRole('status').textContent).toBe('');
    expect(
      within(sidebar).getByRole('button', { name: 'Kontrola aktualizácií zlyhala' }),
    ).toBeDefined();
  });
});
