// @vitest-environment jsdom
import type { ThreadId, UnsubscribeOptions } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DemoState } from '../src/data/demo/demo-state';
import { demoIds } from '../src/data/demo/seed/ids';
import type { MailClient } from '../src/data/MailClient';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import { seededClient, showContactOf, sidePane, threadIdOf } from './support/contact-pane';
import { renderApp, resetStores, storageWith } from './support/render-app';

const NEWSLETTER = 'Č. 212: CSS anchor positioning v praxi';
const SENDER = 'Frontend týždenník';

const cloneNewsletter = (
  state: DemoState,
  key: string,
  threadState: 'inbox' | 'done',
): ThreadId => {
  const original = state.threads.get(threadIdOf(state, NEWSLETTER));
  expect(original).toBeDefined();
  const id = demoIds.thread(`o-newsletter-${key}`);
  if (original !== undefined) {
    state.threads.set(id, {
      ...original,
      summary: { ...original.summary, id, subject: `Č. ${key}`, state: threadState },
    });
  }
  return id;
};

const withUnsubscribe = (base: MailClient, options: UnsubscribeOptions) => {
  const calls: ThreadId[] = [];
  const client: MailClient = {
    ...base,
    getUnsubscribeOptions: () => Promise.resolve(options),
    unsubscribe: (threadId) => {
      calls.push(threadId);
      return Promise.resolve();
    },
  };
  return { client, calls };
};

const unsubscribeButton = () => within(sidePane()).getByRole('button', { name: /Odhlásiť sa/ });

const showNewsletter = async (client: MailClient, state: DemoState, opened: string[] = []) => {
  const platform = createBrowserPlatform(storageWith({ mode: 'local' }));
  renderApp({
    demo: () => client,
    platform: {
      ...platform,
      openExternal: (url) => {
        opened.push(url);
      },
    },
  });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  showContactOf(threadIdOf(state, NEWSLETTER));
  await waitFor(() => {
    expect(within(sidePane()).getByRole('heading', { level: 3 }).textContent).toBe(SENDER);
  });
};

describe('contact pane for an automated sender', () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it('shows a tagged header with mail stats and no lists or person actions', async () => {
    const { state, client } = seededClient();
    cloneNewsletter(state, '211', 'inbox');
    cloneNewsletter(state, '210', 'done');
    await showNewsletter(client, state);

    expect(within(sidePane()).getByText('automatický')).toBeDefined();
    await waitFor(() => {
      expect(within(sidePane()).getByText(/^3 maily · posledný /)).toBeDefined();
    });
    expect(within(sidePane()).queryByRole('heading', { level: 4 })).toBeNull();
    expect(within(sidePane()).queryByRole('button', { name: /Napísať/ })).toBeNull();
    expect(within(sidePane()).queryByRole('button', { name: /Opýtať sa AI/ })).toBeNull();
  });

  it('archives every inbox thread of the sender after a confirmation', async () => {
    const { state, client } = seededClient();
    const second = cloneNewsletter(state, '211', 'inbox');
    const third = cloneNewsletter(state, '209', 'inbox');
    const old = cloneNewsletter(state, '210', 'done');
    await showNewsletter(client, state);

    act(() => {
      fireEvent.click(within(sidePane()).getByRole('button', { name: /Archivovať všetky/ }));
    });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(
      `Archivovať 3 vlákna od ${SENDER}?`,
    );
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: /^Archivovať/ }));
    });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Archivované: 3 vlákna');
    });
    const original = threadIdOf(state, NEWSLETTER);
    expect(
      [original, second, third, old].map((id) => state.threads.get(id)?.summary.state),
    ).toEqual(['done', 'done', 'done', 'done']);
    const archivedIds = (await client.listThreads({ view: 'archive' })).items.map(
      (item) => item.id,
    );
    const doneIds = (await client.listThreads({ view: 'done' })).items.map((item) => item.id);
    expect(archivedIds).toEqual(expect.arrayContaining([original, second, third, old]));
    expect(doneIds.filter((id) => [original, second, third, old].includes(id))).toEqual([]);
    expect(state.threads.get(threadIdOf(state, 'Obed v piatok?'))?.summary.state).toBe('inbox');
  });

  it('sends a one-click unsubscribe only after the user confirms', async () => {
    const { state, client: base } = seededClient();
    const calls: ThreadId[] = [];
    const client: MailClient = {
      ...base,
      unsubscribe: (threadId, url) => {
        calls.push(threadId);
        return base.unsubscribe(threadId, url);
      },
    };
    await showNewsletter(client, state);

    await waitFor(() => {
      expect(unsubscribeButton()).toHaveProperty('disabled', false);
    });
    act(() => {
      fireEvent.click(unsubscribeButton());
    });
    const dialog = await screen.findByRole('alertdialog');
    expect(calls).toEqual([]);
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: /^Odhlásiť sa/ }));
    });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(`Odhlásené z odberu od ${SENDER}`);
    });
    expect(calls).toEqual([threadIdOf(state, NEWSLETTER)]);
  });

  it('asks again when the one-click target changed after the user confirmed it', async () => {
    const { state, client: base } = seededClient();
    const shown: string[] = [];
    const client: MailClient = {
      ...base,
      getUnsubscribeOptions: async (threadId) => {
        const current = await base.getUnsubscribeOptions(threadId);
        const options =
          shown.length === 0 ? { ...current, url: 'https://frontend-tyzdennik.sk/stary' } : current;
        shown.push(options.url ?? '');
        return options;
      },
    };
    await showNewsletter(client, state);

    await waitFor(() => {
      expect(unsubscribeButton()).toHaveProperty('disabled', false);
    });
    act(() => {
      fireEvent.click(unsubscribeButton());
    });
    const dialog = await screen.findByRole('alertdialog');
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: /^Odhlásiť sa/ }));
    });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Odkaz na odhlásenie sa medzitým zmenil',
      );
    });
    await waitFor(() => {
      expect(shown).toEqual([
        'https://frontend-tyzdennik.sk/stary',
        'https://frontend-tyzdennik.sk/odhlasit',
      ]);
    });
  });

  it('opens an https unsubscribe page in the browser after confirmation', async () => {
    const { state, client: base } = seededClient();
    const { client, calls } = withUnsubscribe(base, {
      oneClick: false,
      url: 'https://frontend-tyzdennik.sk/odhlasit?id=7',
      mailto: { to: 'odhlasit@frontend-tyzdennik.sk', subject: null, body: null },
    });
    const opened: string[] = [];
    await showNewsletter(client, state, opened);

    await waitFor(() => {
      expect(unsubscribeButton()).toHaveProperty('disabled', false);
    });
    act(() => {
      fireEvent.click(unsubscribeButton());
    });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/frontend-tyzdennik\.sk$/)).toBeDefined();
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: /^Otvoriť/ }));
    });

    expect(opened).toEqual(['https://frontend-tyzdennik.sk/odhlasit?id=7']);
    expect(calls).toEqual([]);
  });

  it('prefills the composer when the sender only offers a mailto', async () => {
    const { state, client: base } = seededClient();
    const { client } = withUnsubscribe(base, {
      oneClick: false,
      url: null,
      mailto: { to: 'odhlasit@frontend-tyzdennik.sk', subject: 'unsubscribe', body: null },
    });
    await showNewsletter(client, state);

    await waitFor(() => {
      expect(unsubscribeButton()).toHaveProperty('disabled', false);
    });
    act(() => {
      fireEvent.click(unsubscribeButton());
    });

    const compose = await screen.findByRole('dialog', { name: 'Nová správa' });
    expect(
      within(compose).getByRole('button', {
        name: 'Odstrániť príjemcu odhlasit@frontend-tyzdennik.sk',
      }),
    ).toBeDefined();
    expect(within(compose).getByRole<HTMLInputElement>('textbox', { name: 'Predmet' }).value).toBe(
      'unsubscribe',
    );
  });

  it('disables the button with a hint when the sender offers no unsubscribe', async () => {
    const { state, client: base } = seededClient();
    const { client } = withUnsubscribe(base, { oneClick: false, url: null, mailto: null });
    await showNewsletter(client, state);

    await waitFor(() => {
      expect(unsubscribeButton().getAttribute('title')).toBe(
        'Odosielateľ neposiela odkaz na odhlásenie',
      );
    });
    expect(unsubscribeButton()).toHaveProperty('disabled', true);
  });
});
