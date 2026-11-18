// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';
import { renderApp, resetStores, storageWith } from './support/render-app';
import { serverDetail, serverThread } from './support/thread-fixtures';

const SUBJECT = 'Release checklist 2.15';

describe('checklist ticks in synced mode', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    server = await startContractServer();
    const thread = serverThread(SUBJECT);
    server.handle('threads.list', () => ({ body: { items: [thread], nextCursor: null } }));
    server.handle('threads.get', () => ({
      body: serverDetail(thread, [], {
        aiSummary: 'Lucia chce potvrdiť úlohy do piatka.',
        checklist: [
          { id: 'c1', text: 'Prejsť checklist 2.15', done: false },
          { id: 'c2', text: 'Potvrdiť Lucii WEB-482', done: false },
        ],
      }),
    }));
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  const openThread = async () => {
    const platform = createBrowserPlatform(
      storageWith({ mode: 'synced', activeServerUrl: server.url, savedServers: [] }),
    );
    await platform.tokenStore(server.url).save(tokens('access-1'));
    renderApp({ platform });
    const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
    act(() => {
      fireEvent.click(within(list).getAllByRole('option')[0] ?? document.body);
    });
    return screen.findByRole('region', { name: 'Zhrnutie' });
  };

  it('sends the tick to the server', async () => {
    server.handle('threads.updateChecklist', (request) => ({
      body: {
        checklist: [{ id: 'c1', text: 'Prejsť checklist 2.15', ...(request.body as object) }],
      },
    }));
    const summary = await openThread();
    const item = within(summary).getByRole('button', { name: /Prejsť checklist/ });
    expect(within(summary).getByText('Ďalšie kroky')).toBeDefined();
    expect(within(summary).getByText('Dokončené 0 z 2')).toBeDefined();
    act(() => {
      fireEvent.click(item);
    });
    await waitFor(() => {
      expect(item.getAttribute('aria-pressed')).toBe('true');
    });
    expect(within(summary).getByText('Dokončené 1 z 2')).toBeDefined();
    await waitFor(() => {
      expect(
        server.requests.find((request) => request.key === 'threads.updateChecklist'),
      ).toMatchObject({ url: '/threads/thread-1/checklist', body: { itemId: 'c1', done: true } });
    });
  });

  it('restores only the failed item and tells the user', async () => {
    server.handle('threads.updateChecklist', (request) =>
      (request.body as { itemId: string }).itemId === 'c1'
        ? { status: 404, body: { error: { code: 'not_found', message: 'Bod neexistuje' } } }
        : {
            body: { checklist: [{ id: 'c2', text: 'Potvrdiť Lucii WEB-482', done: true }] },
          },
    );
    const summary = await openThread();
    const first = within(summary).getByRole('button', { name: /Prejsť checklist/ });
    const second = within(summary).getByRole('button', { name: /Potvrdiť Lucii/ });
    act(() => {
      fireEvent.click(first);
      fireEvent.click(second);
    });
    expect(await screen.findByText(/Bod sa nepodarilo uložiť: Bod neexistuje/)).toBeDefined();
    await waitFor(() => {
      expect(first.getAttribute('aria-pressed')).toBe('false');
    });
    expect(second.getAttribute('aria-pressed')).toBe('true');
  });

  it('applies repeated ticks of one item in order and ignores stale failures', async () => {
    let calls = 0;
    server.handle('threads.updateChecklist', (request) => {
      calls += 1;
      const body = request.body as { done: boolean };
      return calls === 1
        ? {
            status: 500,
            delayMs: 80,
            body: { error: { code: 'internal', message: 'Výpadok' } },
          }
        : { body: { checklist: [{ id: 'c1', text: 'Prejsť checklist 2.15', ...body }] } };
    });
    const summary = await openThread();
    const item = within(summary).getByRole('button', { name: /Prejsť checklist/ });
    const tick = async (expected: string) => {
      act(() => {
        fireEvent.click(item);
      });
      await waitFor(() => {
        expect(item.getAttribute('aria-pressed')).toBe(expected);
      });
    };
    await tick('true');
    await tick('false');
    await tick('true');
    await waitFor(() => {
      expect(calls).toBe(3);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(item.getAttribute('aria-pressed')).toBe('true');
    expect(
      server.requests
        .filter((request) => request.key === 'threads.updateChecklist')
        .map((request) => (request.body as { done: boolean }).done),
    ).toEqual([true, false, true]);
    expect(screen.queryByText(/Bod sa nepodarilo uložiť/)).toBeNull();
  });

  it('keeps ticks ordered when the thread is closed and opened again meanwhile', async () => {
    const arrivals: { done: boolean; at: number }[] = [];
    server.handle('threads.updateChecklist', (request) => {
      const { done } = request.body as { done: boolean };
      arrivals.push({ done, at: Date.now() });
      return {
        delayMs: arrivals.length === 1 ? 80 : 0,
        body: { checklist: [{ id: 'c1', text: 'Prejsť checklist 2.15', done }] },
      };
    });
    const summary = await openThread();
    act(() => {
      fireEvent.click(within(summary).getByRole('button', { name: /Prejsť checklist/ }));
    });
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });
    const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
    act(() => {
      fireEvent.click(within(list).getAllByRole('option')[0] ?? document.body);
    });
    const reopened = await screen.findByRole('region', { name: 'Zhrnutie' });
    const item = within(reopened).getByRole('button', { name: /Prejsť checklist/ });
    expect(item.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      fireEvent.click(item);
    });
    await waitFor(() => {
      expect(arrivals).toHaveLength(2);
    });
    expect(arrivals.map((arrival) => arrival.done)).toEqual([true, false]);
    expect((arrivals[1]?.at ?? 0) - (arrivals[0]?.at ?? 0)).toBeGreaterThanOrEqual(70);
    expect(item.getAttribute('aria-pressed')).toBe('false');
  });
});
