// @vitest-environment jsdom
import {
  type AiJob,
  AiJobSchema,
  type ThreadDetail,
  ThreadDetailSchema,
  type ThreadSummary,
} from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import { type ContractServer, startContractServer } from './support/contract-server';
import type { TestSocket } from './support/ws-server';
import { tokens } from './support/fixtures';
import { renderApp, resetStores, storageWith } from './support/render-app';
import { serverDetail, serverThread } from './support/thread-fixtures';

const STAMP = '2026-11-15T08:05:00.000Z';

const jobOf = (
  kind: 'summary' | 'replySuggestions',
  threadId: string,
  status: AiJob['status'],
): AiJob =>
  AiJobSchema.parse({
    id: `job-${kind}`,
    userId: 'user-1',
    kind,
    status,
    runnerLocation: 'server',
    runner: 'claude',
    input: { kind, threadId },
    output: null,
    error: null,
    createdAt: STAMP,
    updatedAt: STAMP,
  });

const doneJob = (kind: 'summary' | 'replySuggestions', threadId: string): AiJob =>
  jobOf(kind, threadId, 'done');

const jobRefs = [
  { kind: 'summary', jobId: 'job-summary' },
  { kind: 'replySuggestions', jobId: 'job-replySuggestions' },
];

const withAi = (detail: ThreadDetail, extras: Partial<ThreadDetail>): ThreadDetail =>
  ThreadDetailSchema.parse({ ...detail, ...extras });

describe('thread AI in synced mode', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    server = await startContractServer();
    server.onSocketMessage((socket, text) => {
      const message = JSON.parse(text) as { type: string };
      if (message.type === 'hello') {
        socket.send(JSON.stringify({ type: 'welcome', userId: 'user-1', deviceId: 'device-1' }));
      }
    });
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  const settle = async () => {
    let seen = -1;
    while (seen !== server.requests.length) {
      seen = server.requests.length;
      await act(() => new Promise((resolve) => setTimeout(resolve, 120)));
    }
  };

  const openFirstThread = async (threads: readonly ThreadSummary[]) => {
    server.handle('threads.list', () => ({ body: { items: threads, nextCursor: null } }));
    const platform = createBrowserPlatform(
      storageWith({ mode: 'synced', activeServerUrl: server.url, savedServers: [] }),
    );
    await platform.tokenStore(server.url).save(tokens('access-1'));
    renderApp({ platform });
    const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
    await waitFor(() => {
      expect(server.sockets[0]?.messages.length).toBeGreaterThan(0);
    });
    await settle();
    act(() => {
      fireEvent.click(within(list).getAllByRole('option')[0] ?? document.body);
    });
    return list;
  };

  const pushJob = (job: AiJob) => {
    server.sockets[0]?.send(
      JSON.stringify({
        type: 'event',
        event: { type: 'ai.job.updated', at: STAMP, data: { job } },
      }),
    );
  };

  it('asks for the AI once, shows a quiet pending state and fills it in when jobs finish', async () => {
    const thread = serverThread('Zmluva na podpis');
    const empty = serverDetail(thread, []);
    let detail = empty;
    server.handle('threads.get', () => ({ body: detail }));
    server.handle('threads.prepareAi', () => ({
      body: { pending: ['summary', 'replySuggestions'] },
    }));

    await openFirstThread([thread]);

    const summary = await screen.findByRole('region', { name: 'Zhrnutie' });
    expect(within(summary).getByText('AI pripravuje zhrnutie…')).toBeDefined();
    expect(await screen.findByText('AI pripravuje návrhy odpovedí…')).toBeDefined();
    expect(server.requests.filter((request) => request.key === 'threads.prepareAi')).toHaveLength(
      1,
    );
    await waitFor(() => {
      expect(server.sockets[0]?.messages.length).toBeGreaterThan(0);
    });

    detail = withAi(empty, {
      aiSummary: 'Jana posiela zmluvu na podpis.',
      checklist: [{ id: 'check-1', text: 'Podpísať do piatku', done: false }],
    });
    act(() => {
      pushJob(doneJob('summary', thread.id));
    });
    expect(await screen.findByText('Jana posiela zmluvu na podpis.')).toBeDefined();
    expect(screen.getByRole('button', { name: /Podpísať do piatku/ })).toBeDefined();
    expect(screen.queryByText('AI pripravuje zhrnutie…')).toBeNull();
    expect(screen.getByText('AI pripravuje návrhy odpovedí…')).toBeDefined();

    detail = withAi(detail, {
      replySuggestions: [
        { id: 'reply-1', label: 'Podpíšem', body: 'Podpíšem do piatku.' },
        { id: 'reply-2', label: 'Mám otázku', body: 'Mám jednu otázku.' },
        { id: 'reply-3', label: 'Neskôr', body: 'Pozriem sa budúci týždeň.' },
      ],
    });
    act(() => {
      pushJob(doneJob('replySuggestions', thread.id));
    });
    expect(await screen.findByRole('button', { name: /Podpíšem/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Mám otázku/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Neskôr/ })).toBeDefined();
    expect(screen.queryByText('AI pripravuje návrhy odpovedí…')).toBeNull();
    expect(server.requests.filter((request) => request.key === 'threads.prepareAi')).toHaveLength(
      1,
    );
  });

  it('ignores a job that failed before the prepare response arrived', async () => {
    const thread = serverThread('Rýchla chyba');
    server.handle('threads.get', () => ({ body: serverDetail(thread, []) }));
    server.handle('ai.getJob', () => ({
      body: jobOf('replySuggestions', thread.id, 'running'),
    }));
    server.handle('threads.prepareAi', () => {
      pushJob(jobOf('summary', thread.id, 'error'));
      return {
        body: { pending: ['summary', 'replySuggestions'], jobs: jobRefs },
        delayMs: 150,
      };
    });

    await openFirstThread([thread]);

    expect(await screen.findByText('AI pripravuje návrhy odpovedí…')).toBeDefined();
    expect(screen.queryByText('AI pripravuje zhrnutie…')).toBeNull();
    await waitFor(() => {
      expect(server.requests.filter((request) => request.key === 'ai.getJob')).toHaveLength(1);
    });
    expect(screen.queryByText('AI pripravuje zhrnutie…')).toBeNull();
  });

  it('reconciles pending jobs with the server after the realtime connection comes back', async () => {
    const thread = serverThread('Výpadok spojenia');
    const empty = serverDetail(thread, []);
    let detail = empty;
    let summaryStatus: AiJob['status'] = 'running';
    server.handle('threads.get', () => ({ body: detail }));
    server.handle('ai.getJob', (_request, params) => ({
      body:
        params.id === 'job-summary'
          ? jobOf('summary', thread.id, summaryStatus)
          : jobOf('replySuggestions', thread.id, 'running'),
    }));
    server.handle('threads.prepareAi', () => ({
      body: { pending: ['summary', 'replySuggestions'], jobs: jobRefs },
    }));

    await openFirstThread([thread]);
    const summary = await screen.findByRole('region', { name: 'Zhrnutie' });
    expect(within(summary).getByText('AI pripravuje zhrnutie…')).toBeDefined();
    await waitFor(() => {
      expect(server.requests.filter((request) => request.key === 'ai.getJob')).toHaveLength(2);
    });

    summaryStatus = 'done';
    detail = withAi(empty, { aiSummary: 'Hotové počas výpadku.' });
    act(() => {
      server.sockets[0]?.close();
    });

    expect(await screen.findByText('Hotové počas výpadku.', {}, { timeout: 5_000 })).toBeDefined();
    expect(screen.queryByText('AI pripravuje zhrnutie…')).toBeNull();
    expect(screen.getByText('AI pripravuje návrhy odpovedí…')).toBeDefined();
    expect(server.sockets.length).toBeGreaterThan(1);
    expect(server.requests.filter((request) => request.key === 'threads.prepareAi')).toHaveLength(
      1,
    );
  });

  it('reconciles pending jobs on the first realtime welcome too', async () => {
    const held: { socket: TestSocket | null } = { socket: null };
    server.onSocketMessage((socket, text) => {
      if ((JSON.parse(text) as { type: string }).type === 'hello') {
        held.socket = socket;
      }
    });
    const thread = serverThread('Pomalé spojenie');
    const empty = serverDetail(thread, []);
    let detail = empty;
    let summaryStatus: AiJob['status'] = 'running';
    server.handle('threads.get', () => ({ body: detail }));
    server.handle('ai.getJob', (_request, params) => ({
      body:
        params.id === 'job-summary'
          ? jobOf('summary', thread.id, summaryStatus)
          : jobOf('replySuggestions', thread.id, 'running'),
    }));
    server.handle('threads.prepareAi', () => ({
      body: { pending: ['summary', 'replySuggestions'], jobs: jobRefs },
    }));

    await openFirstThread([thread]);
    const summary = await screen.findByRole('region', { name: 'Zhrnutie' });
    expect(within(summary).getByText('AI pripravuje zhrnutie…')).toBeDefined();
    await waitFor(() => {
      expect(server.requests.filter((request) => request.key === 'ai.getJob')).toHaveLength(2);
    });
    expect(held.socket).not.toBeNull();

    summaryStatus = 'done';
    detail = withAi(empty, { aiSummary: 'Hotové pred prvým spojením.' });
    act(() => {
      held.socket?.send(
        JSON.stringify({ type: 'welcome', userId: 'user-1', deviceId: 'device-1' }),
      );
    });

    expect(await screen.findByText('Hotové pred prvým spojením.')).toBeDefined();
    expect(screen.queryByText('AI pripravuje zhrnutie…')).toBeNull();
  });

  it('shows Jira threads with a clean subject and the actor as the sender', async () => {
    const thread = serverThread('[JIRA] (CMS-217) Editor stráca obrázky', {
      participants: [{ name: 'Jira', email: 'jira@acme.atlassian.net' }],
      jiraKey: 'CMS-217',
      jiraActor: 'Peter Novák',
    });
    server.handle('threads.get', () => ({ body: serverDetail(thread, []) }));
    server.handle('threads.prepareAi', () => ({ body: { pending: [] } }));

    const list = await openFirstThread([thread]);

    const row = within(list).getAllByRole('option')[0] ?? document.body;
    expect(within(row).getByText('Peter Novák')).toBeDefined();
    expect(within(row).getByText('Jira')).toBeDefined();
    expect(within(row).getByText('Editor stráca obrázky')).toBeDefined();
    expect(within(row).queryByText(/\[JIRA\]/)).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Editor stráca obrázky' })).toBeDefined();
    const contact = screen.getByRole('tabpanel', { name: 'Kontakt' });
    expect(await within(contact).findByRole('heading', { name: 'Peter Novák' })).toBeDefined();
  });
});
