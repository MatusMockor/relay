// @vitest-environment jsdom
import {
  type AiJob,
  type ThreadDetail,
  ThreadDetailSchema,
  type ReplySuggestion,
} from '@relay/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ContractServer, startContractServer } from './support/contract-server';
import { resetStores } from './support/render-app';
import {
  jobOf,
  openFirstThread,
  pushJob,
  refOf,
  requestCount,
  welcomeOnHello,
} from './support/thread-ai-session';
import type { TestSocket } from './support/ws-server';
import { serverDetail, serverThread } from './support/thread-fixtures';

const SUMMARY_ASK = /^(Zhrnúť vlákno|Podrobné zhrnutie)$/;

const REPLIES: ReplySuggestion[] = [
  { id: 'reply-1', label: 'Podpíšem', body: 'Podpíšem do piatku.' },
  { id: 'reply-2', label: 'Mám otázku', body: 'Mám jednu otázku.' },
  { id: 'reply-3', label: 'Neskôr', body: 'Pozriem sa budúci týždeň.' },
];

const withAi = (detail: ThreadDetail, extras: Partial<ThreadDetail>): ThreadDetail =>
  ThreadDetailSchema.parse({ ...detail, ...extras });

describe('thread AI in synced mode', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    server = await startContractServer();
    welcomeOnHello(server);
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  it('asks for reply suggestions once on open and never for the summary', async () => {
    const thread = serverThread('Zmluva na podpis');
    const empty = serverDetail(thread, []);
    let detail = empty;
    server.handle('threads.get', () => ({ body: detail }));
    server.handle('threads.prepareAi', () => ({ body: { pending: ['replySuggestions'] } }));

    await openFirstThread(server, [thread]);

    expect(await screen.findByText('AI pripravuje návrhy odpovedí…')).toBeDefined();
    expect(await screen.findByRole('button', { name: SUMMARY_ASK })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Zhrnutie' })).toBeNull();
    expect(screen.queryByText('AI pripravuje zhrnutie…')).toBeNull();
    await waitFor(() => {
      expect(server.sockets[0]?.messages.length).toBeGreaterThan(0);
    });

    detail = withAi(empty, { replySuggestions: REPLIES });
    act(() => {
      pushJob(server, jobOf('replySuggestions', thread.id, 'done'));
    });
    expect(await screen.findByRole('button', { name: /Podpíšem/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Mám otázku/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Neskôr/ })).toBeDefined();
    expect(screen.queryByText('AI pripravuje návrhy odpovedí…')).toBeNull();
    expect(requestCount(server, 'threads.prepareAi')).toBe(1);
    expect(requestCount(server, 'threads.requestSummary')).toBe(0);
  });

  it('ignores a job that failed before the prepare response arrived', async () => {
    const thread = serverThread('Rýchla chyba');
    server.handle('threads.get', () => ({ body: serverDetail(thread, []) }));
    server.handle('threads.prepareAi', () => {
      pushJob(server, jobOf('replySuggestions', thread.id, 'error'));
      return {
        body: { pending: ['replySuggestions'], jobs: [refOf('replySuggestions')] },
        delayMs: 150,
      };
    });

    await openFirstThread(server, [thread]);

    expect(await screen.findByRole('button', { name: SUMMARY_ASK })).toBeDefined();
    await waitFor(() => {
      expect(requestCount(server, 'threads.prepareAi')).toBe(1);
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(screen.queryByText('AI pripravuje návrhy odpovedí…')).toBeNull();
    expect(requestCount(server, 'ai.getJob')).toBe(0);
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
    let status: AiJob['status'] = 'running';
    server.handle('threads.get', () => ({ body: detail }));
    server.handle('ai.getJob', () => ({ body: jobOf('replySuggestions', thread.id, status) }));
    server.handle('threads.prepareAi', () => ({
      body: { pending: ['replySuggestions'], jobs: [refOf('replySuggestions')] },
    }));

    await openFirstThread(server, [thread]);
    expect(await screen.findByText('AI pripravuje návrhy odpovedí…')).toBeDefined();
    await waitFor(() => {
      expect(requestCount(server, 'ai.getJob')).toBe(1);
    });
    expect(held.socket).not.toBeNull();

    status = 'done';
    detail = withAi(empty, { replySuggestions: REPLIES });
    act(() => {
      held.socket?.send(
        JSON.stringify({ type: 'welcome', userId: 'user-1', deviceId: 'device-1' }),
      );
    });

    expect(await screen.findByRole('button', { name: /Podpíšem/ })).toBeDefined();
    expect(screen.queryByText('AI pripravuje návrhy odpovedí…')).toBeNull();
  });

  it('shows Jira threads with a clean subject and the actor as the sender', async () => {
    const thread = serverThread('[JIRA] (CMS-217) Editor stráca obrázky', {
      participants: [{ name: 'Jira', email: 'jira@acme.atlassian.net' }],
      jiraKey: 'CMS-217',
      jiraActor: 'Peter Novák',
    });
    server.handle('threads.get', () => ({ body: serverDetail(thread, []) }));
    server.handle('threads.prepareAi', () => ({ body: { pending: [] } }));

    const list = await openFirstThread(server, [thread]);

    const row = within(list).getAllByRole('option')[0] ?? document.body;
    expect(within(row).getByText('Peter Novák')).toBeDefined();
    expect(within(row).getByTitle('Cez Jira').textContent).toBe('Peter Novák');
    expect(within(row).getByText('Editor stráca obrázky')).toBeDefined();
    expect(within(row).queryByText(/\[JIRA\]/)).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Editor stráca obrázky' })).toBeDefined();
    const contact = screen.getByRole('tabpanel', { name: 'Kontakt' });
    expect(await within(contact).findByRole('heading', { name: 'Peter Novák' })).toBeDefined();
  });
});
