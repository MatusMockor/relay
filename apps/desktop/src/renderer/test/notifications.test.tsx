// @vitest-environment jsdom
import type { SplitId, ThreadId, ThreadSummary } from '@relay/shared';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import type { Platform } from '../src/platform/Platform';
import { INBOX } from '../src/state/folders';
import { setUi, useUiStore } from '../src/state/ui-store';
import { demoClient } from './features-support';
import { renderApp, resetStores, storageWith } from './support/render-app';

const openNotificationSettings = () => {
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'notifications', adding: false } });
  });
  return screen.getByRole('dialog', { name: 'Nastavenia' });
};

const notifyingPlatform = () => {
  const listeners = new Set<(threadId: ThreadId) => void>();
  const platform: Platform = {
    ...createBrowserPlatform(storageWith({ mode: 'local' })),
    subscribeToThreadOpens: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const click = (threadId: ThreadId) => {
    act(() => {
      listeners.forEach((listener) => {
        listener(threadId);
      });
    });
  };
  return { platform, click };
};

const firstThread = async (
  client: MailClient,
  splitId?: SplitId,
): Promise<ThreadSummary | undefined> =>
  (await client.listThreads({ view: 'inbox', splitId })).items[0];

describe('notification settings', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('describes the selected mode and limits notifications to the main tab', async () => {
    renderApp({ demo: demoClient });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    const sheet = openNotificationSettings();
    expect(
      within(sheet).getByText('Relay ťa vyruší, len keď o to stojíš. Predvolene je ticho.'),
    ).toBeTruthy();
    expect(
      await within(sheet).findByText('Žiadne notifikácie. Poštu otvoríš, keď sa rozhodneš ty.'),
    ).toBeTruthy();
    act(() => {
      fireEvent.click(within(sheet).getByRole('radio', { name: 'Hneď pri dôležitých' }));
    });
    expect(
      await within(sheet).findByText(
        'Notifikácia pri každom novom maile v záložke Dôležité s odosielateľom a predmetom. Maily v ostatných splitoch prídu potichu.',
      ),
    ).toBeTruthy();
    act(() => {
      fireEvent.click(within(sheet).getByRole('radio', { name: 'Súhrn každých 15 min' }));
    });
    expect(await within(sheet).findByText(/Jedna notifikácia s počtom nových mailov/)).toBeTruthy();
  });

  it('opens the automations section from the hint', async () => {
    renderApp({ demo: demoClient });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    const sheet = openNotificationSettings();
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Automatizáciách' }));
    });
    expect(useUiStore.getState().overlay).toEqual({
      kind: 'settings',
      section: 'automations',
      adding: false,
    });
  });
});

describe('opening a thread from a desktop notification', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('switches to the main tab and opens the clicked thread', async () => {
    const client = demoClient();
    const thread = await firstThread(client);
    expect(thread).toBeDefined();
    if (thread === undefined) {
      return;
    }
    const { platform, click } = notifyingPlatform();
    renderApp({ platform, demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    act(() => {
      setUi({ folder: { kind: 'view', view: 'done' } });
    });
    click(thread.id);
    expect(useUiStore.getState()).toMatchObject({ folder: INBOX, openThreadId: thread.id });
  });

  it('opens a thread that lives in a split inside its split tab', async () => {
    const client = demoClient();
    const [split] = await client.listSplits();
    const thread = split === undefined ? undefined : await firstThread(client, split.id);
    expect(thread).toBeDefined();
    if (split === undefined || thread === undefined) {
      return;
    }
    const { platform, click } = notifyingPlatform();
    renderApp({ platform, demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    act(() => {
      setUi({ folder: { kind: 'inbox', splitId: split.id } });
    });
    await screen.findByText(thread.subject);
    act(() => {
      setUi({ folder: { kind: 'view', view: 'done' } });
    });
    click(thread.id);
    expect(useUiStore.getState()).toMatchObject({
      folder: { kind: 'inbox', splitId: split.id },
      openThreadId: thread.id,
    });
  });

  const openedFromNotification = async () => {
    const client = demoClient();
    const thread = await firstThread(client);
    expect(thread).toBeDefined();
    const notifying = notifyingPlatform();
    renderApp({ platform: notifying.platform, demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    return { thread, click: notifying.click };
  };

  it('closes settings so the opened thread is visible', async () => {
    const { thread, click } = await openedFromNotification();
    if (thread === undefined) {
      return;
    }
    openNotificationSettings();
    click(thread.id);
    expect(useUiStore.getState()).toMatchObject({ overlay: null, openThreadId: thread.id });
    expect(screen.queryByRole('dialog', { name: 'Nastavenia' })).toBeNull();
  });

  it('keeps an open compose window and the account form so typed input is not lost', async () => {
    const { thread, click } = await openedFromNotification();
    if (thread === undefined) {
      return;
    }
    const compose = { kind: 'compose', init: { subject: 'Rozpísané' }, scope: 'all' } as const;
    const accountForm = { kind: 'settings', section: 'accounts', adding: true } as const;
    for (const overlay of [compose, accountForm]) {
      act(() => {
        setUi({ overlay });
      });
      click(thread.id);
      expect(useUiStore.getState()).toMatchObject({ overlay, openThreadId: thread.id });
    }
  });
});
