// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import { setUi } from '../src/state/ui-store';
import { demoClient, openThreadBySubject } from './features-support';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';
import { renderApp, resetStores, storageWith } from './support/render-app';
import { serverDetail, serverThread } from './support/thread-fixtures';

const SUBJECT = 'Ponuka na redizajn';

const copyLines = (article: HTMLElement): string[] =>
  Array.from(article.querySelectorAll('.mh-copy')).map((line) => line.textContent);

describe('message copies in the thread view', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    server = await startContractServer();
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  it('shows Cc and Bcc of a sent message loaded from the server', async () => {
    const thread = serverThread(SUBJECT);
    server.handle('threads.list', () => ({ body: { items: [thread], nextCursor: null } }));
    server.handle('threads.get', () => ({
      body: serverDetail(thread, [], {
        message: {
          cc: [{ name: 'Eva Šimková', email: 'eva@firma.sk' }],
          bcc: [
            { name: 'Martin Hudec', email: 'martin@firma.sk' },
            { name: null, email: 'archiv@firma.sk' },
          ],
        },
      }),
    }));
    const platform = createBrowserPlatform(
      storageWith({ mode: 'synced', activeServerUrl: server.url, savedServers: [] }),
    );
    await platform.tokenStore(server.url).save(tokens('access-1'));
    renderApp({ platform });

    await openThreadBySubject(SUBJECT);

    const article = screen.getByRole('article', { name: 'Správa od Peter Novák' });
    expect(copyLines(article)).toEqual([
      'kópia: Eva Šimková',
      'skrytá kópia: Martin Hudec, archiv@firma.sk',
    ]);
    expect(
      within(article)
        .getByText(/^skrytá kópia:/)
        .getAttribute('title'),
    ).toBe('martin@firma.sk, archiv@firma.sk');
  });

  it('shows no copy lines when a message has neither Cc nor Bcc', async () => {
    const thread = serverThread(SUBJECT);
    server.handle('threads.list', () => ({ body: { items: [thread], nextCursor: null } }));
    server.handle('threads.get', () => ({ body: serverDetail(thread, []) }));
    const platform = createBrowserPlatform(
      storageWith({ mode: 'synced', activeServerUrl: server.url, savedServers: [] }),
    );
    await platform.tokenStore(server.url).save(tokens('access-1'));
    renderApp({ platform });

    await openThreadBySubject(SUBJECT);

    const article = screen.getByRole('article', { name: 'Správa od Peter Novák' });
    expect(copyLines(article)).toEqual([]);
  });

  it('shows the Bcc of the demo onboarding reply the user sent', async () => {
    const client = demoClient();
    const sent = await client.listThreads({ view: 'sent' });
    const onboarding = sent.items.find((item) => item.subject === 'Re: Onboarding checklist');
    expect(onboarding).toBeDefined();
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    act(() => {
      setUi({ openThreadId: onboarding?.id ?? null });
    });

    const article = await screen.findByRole('article', { name: 'Správa od Ty' });
    expect(copyLines(article)).toEqual(['kópia: Michal Kráľ', 'skrytá kópia: Martin Hudec']);
  });
});
