import {
  AccountIdSchema,
  type AiEvent,
  AttachmentIdSchema,
  MailboxIdSchema,
  type RealtimeEvent,
  ThreadSummarySchema,
} from '@relay/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpApi } from '../src/data/remote/HttpApi';
import { RendererTokenSession } from '../src/data/remote/RendererTokenSession';
import { createRemoteMailClient } from '../src/data/remote/RemoteMailClient';
import { MemoryTokenStore } from '../src/data/remote/TokenStore';
import type { MailClient } from '../src/data/MailClient';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';

const THREAD = ThreadSummarySchema.parse({
  id: 'thread-1',
  accountId: 'acc-1',
  subject: 'Ahoj z servera',
  participants: [{ name: 'Peter Novák', email: 'peter@firma.sk' }],
  lastMessageAt: '2026-11-15T08:00:00.000Z',
  messageCount: 1,
  unread: true,
  snippet: 'Ahoj',
  aiOneLiner: null,
  jiraKey: null,
  splitIds: [],
  labelIds: [],
  state: 'inbox',
  remindAt: null,
  hasDraft: false,
});

const eventOf = (subject: string): RealtimeEvent => ({
  type: 'thread.upserted',
  at: '2026-11-15T08:00:00.000Z',
  data: { thread: { ...THREAD, subject } },
});

const waitFor = async (check: () => boolean, timeoutMs = 3_000): Promise<void> => {
  const started = Date.now();
  while (!check() && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(check()).toBe(true);
};

describe('RemoteMailClient', () => {
  let server: ContractServer;
  let store: MemoryTokenStore;
  let client: MailClient | null = null;

  beforeEach(async () => {
    server = await startContractServer();
    store = new MemoryTokenStore();
    await store.save(tokens('access-1'));
    server.onSocketMessage((socket, text) => {
      const message = JSON.parse(text) as { type: string; accessToken?: string };
      if (message.type === 'hello' && message.accessToken === 'access-1') {
        socket.send(JSON.stringify({ type: 'welcome', userId: 'user-1', deviceId: 'device-1' }));
      }
    });
  });

  afterEach(async () => {
    client?.dispose();
    client = null;
    await server.close();
  });

  const connect = () => {
    client = createRemoteMailClient({
      http: new HttpApi({
        baseUrl: server.url,
        session: new RendererTokenSession({ baseUrl: server.url, tokens: store }),
      }),
      reconnectDelayMs: 20,
    });
    return client;
  };

  it('calls typed contract endpoints with the access token', async () => {
    server.handle('threads.list', () => ({ body: { items: [THREAD], nextCursor: null } }));
    const page = await connect().listThreads({
      view: 'inbox',
      accountId: AccountIdSchema.parse('acc-1'),
    });
    expect(page.items.map((thread) => thread.subject)).toEqual(['Ahoj z servera']);
    const request = server.requests.find((item) => item.key === 'threads.list');
    expect(request?.authorization).toBe('Bearer access-1');
    expect(request?.url).toBe('/threads?view=inbox&accountId=acc-1');
  });

  it('lists the mailboxes of an account and the threads of one folder', async () => {
    const mailbox = {
      id: 'mbx-alfa',
      accountId: 'acc-1',
      name: 'Alfa',
      path: 'Projekty/Alfa',
      delimiter: '/',
      role: 'custom',
      subscribed: true,
      uidValidity: 7,
      unreadCount: 2,
      totalCount: 5,
    };
    server.handle('accounts.mailboxes', () => ({ body: [mailbox] }));
    server.handle('threads.list', () => ({ body: { items: [], nextCursor: null } }));
    const remote = connect();

    expect(await remote.listMailboxes(AccountIdSchema.parse('acc-1'))).toEqual([mailbox]);
    await remote.listThreads({ view: 'mailbox', mailboxId: MailboxIdSchema.parse('mbx-alfa') });

    expect(server.requests.find((item) => item.key === 'accounts.mailboxes')?.url).toBe(
      '/accounts/acc-1/mailboxes',
    );
    expect(server.requests.find((item) => item.key === 'threads.list')?.url).toBe(
      '/threads?view=mailbox&mailboxId=mbx-alfa',
    );
  });

  it('refreshes an expired session once and retries the request', async () => {
    server.handle('auth.refresh', (request) => ({
      body:
        (request.body as { refreshToken: string }).refreshToken === 'refresh-access-1'
          ? tokens('access-2')
          : { error: { code: 'unauthorized', message: 'x' } },
    }));
    server.handle('accounts.list', (request) =>
      request.authorization === 'Bearer access-2'
        ? { body: [] }
        : { status: 401, body: { error: { code: 'unauthorized', message: 'Token expiroval' } } },
    );
    expect(await connect().listAccounts()).toEqual([]);
    expect(server.requests.filter((item) => item.key === 'auth.refresh')).toHaveLength(1);
    expect((await store.load())?.accessToken).toBe('access-2');
  });

  it('keeps the session when refresh fails temporarily', async () => {
    await store.save(tokens('access-1', 'refresh-1', '2000-01-01T00:00:00.000Z'));
    server.handle('auth.refresh', () => ({
      status: 503,
      body: { error: { code: 'internal', message: 'Údržba' } },
    }));
    server.handle('accounts.list', () => ({
      status: 401,
      body: { error: { code: 'unauthorized', message: 'x' } },
    }));
    await expect(connect().listAccounts()).rejects.toMatchObject({ code: 'unauthorized' });
    expect((await store.load())?.refreshToken).toBe('refresh-1');
  });

  it('asks the server to sync now for one or all accounts', async () => {
    server.handle('sync.now', () => ({ body: { accepted: true } }));
    const remote = connect();
    await remote.syncNow();
    await remote.syncNow(AccountIdSchema.parse('acc-1'));
    expect(
      server.requests.filter((item) => item.key === 'sync.now').map((item) => item.body),
    ).toEqual([{}, { accountId: 'acc-1' }]);
    expect(server.requests.at(-1)).toMatchObject({ method: 'POST', url: '/sync' });
  });

  it('saves the account order on the server', async () => {
    server.handle('accounts.reorder', () => ({ body: [] }));
    await connect().reorderAccounts([
      AccountIdSchema.parse('acc-2'),
      AccountIdSchema.parse('acc-1'),
    ]);
    expect(server.requests.at(-1)).toMatchObject({
      key: 'accounts.reorder',
      method: 'PUT',
      url: '/accounts/order',
      authorization: 'Bearer access-1',
      body: { accountIds: ['acc-2', 'acc-1'] },
    });
  });

  it('stores checklist ticks on the server', async () => {
    server.handle('threads.updateChecklist', (request) => ({
      body: { checklist: [{ id: 'c1', text: 'Pozrieť MR', ...(request.body as object) }] },
    }));
    const result = await connect().updateChecklistItem(THREAD.id, { itemId: 'c1', done: true });
    expect(result.checklist[0]?.done).toBe(true);
    expect(server.requests.at(-1)).toMatchObject({
      method: 'PATCH',
      url: '/threads/thread-1/checklist',
      authorization: 'Bearer access-1',
      body: { itemId: 'c1', done: true },
    });
  });

  it('marks a whole folder read on the server', async () => {
    server.handle('threads.markFolderRead', () => ({ body: { count: 4 } }));
    const result = await connect().markFolderRead({
      view: 'mailbox',
      mailboxId: MailboxIdSchema.parse('mbx-alfa'),
    });
    expect(result).toEqual({ count: 4 });
    expect(server.requests.at(-1)).toMatchObject({
      key: 'threads.markFolderRead',
      method: 'POST',
      url: '/threads/mark-read',
      authorization: 'Bearer access-1',
      body: { view: 'mailbox', mailboxId: 'mbx-alfa' },
    });
  });

  it('downloads attachment bytes without parsing them as JSON', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
    server.handle('attachments.content', () => ({
      body: null,
      raw: { contentType: 'application/pdf', bytes },
    }));
    const file = await connect().downloadAttachment(AttachmentIdSchema.parse('att-1'));
    expect(file.contentType).toBe('application/pdf');
    expect(new Uint8Array(await file.blob.arrayBuffer())).toEqual(bytes);
    expect(server.requests.at(-1)).toMatchObject({
      url: '/attachments/att-1/content',
      authorization: 'Bearer access-1',
    });
  });

  it('reports a missing attachment with the shared error shape', async () => {
    server.handle('attachments.content', () => ({
      status: 404,
      body: { error: { code: 'not_found', message: 'Príloha neexistuje' } },
    }));
    await expect(
      connect().downloadAttachment(AttachmentIdSchema.parse('att-2')),
    ).rejects.toMatchObject({ code: 'not_found', message: 'Príloha neexistuje' });
  });

  it('receives realtime events and reconnects after the socket drops', async () => {
    const received: string[] = [];
    connect().subscribe((event) => {
      if (event.type === 'thread.upserted') {
        received.push(event.data.thread.subject);
      }
    });
    await waitFor(() => server.sockets.length === 1 && server.sockets[0]?.messages.length === 1);
    server.sockets[0]?.send(JSON.stringify({ type: 'event', event: eventOf('Prvá udalosť') }));
    await waitFor(() => received.length === 1);
    server.sockets[0]?.close();
    await waitFor(() => server.sockets.length === 2 && server.sockets[1]?.messages.length === 1);
    expect(JSON.parse(server.sockets[1]?.messages[0] ?? '{}')).toMatchObject({
      type: 'hello',
      apiVersion: 1,
      accessToken: 'access-1',
    });
    server.sockets[1]?.send(JSON.stringify({ type: 'event', event: eventOf('Po reconnecte') }));
    await waitFor(() => received.length === 2);
    expect(received).toEqual(['Prvá udalosť', 'Po reconnecte']);
  });

  it('completes AI runs from realtime job updates', async () => {
    const job = {
      id: 'job-1',
      userId: 'user-1',
      kind: 'chatAnswer',
      status: 'queued',
      runnerLocation: 'server',
      runner: 'claude',
      input: { kind: 'chatAnswer', question: 'Čo mám dnes vybaviť?', threadId: null, history: [] },
      output: null,
      error: null,
      createdAt: '2026-11-15T08:00:00.000Z',
      updatedAt: '2026-11-15T08:00:00.000Z',
    };
    server.handle('ai.createJob', () => ({ body: job }));
    server.handle('ai.getJob', () => ({ body: job }));
    const events: AiEvent[] = [];
    connect().runAi(
      {
        input: {
          kind: 'chatAnswer',
          question: 'Čo mám dnes vybaviť?',
          threadId: null,
          history: [],
        },
        runner: 'claude',
        model: 'claude-sonnet-5-5',
        effort: 'high',
      },
      (event) => events.push(event),
    );
    await waitFor(() => events.length === 1 && server.sockets[0]?.messages.length === 1);
    expect(server.requests.find((item) => item.key === 'ai.createJob')?.body).toMatchObject({
      runner: 'claude',
      model: 'claude-sonnet-5-5',
      effort: 'high',
    });
    const done = {
      ...job,
      status: 'done',
      output: { kind: 'chatAnswer', text: 'Review MR !412.' },
    };
    server.sockets[0]?.send(
      JSON.stringify({
        type: 'event',
        event: { type: 'ai.job.updated', at: job.createdAt, data: { job: done } },
      }),
    );
    await waitFor(() => events.length === 2);
    expect(events).toEqual([
      { type: 'started', runner: 'claude' },
      {
        type: 'completed',
        output: { kind: 'chatAnswer', text: 'Review MR !412.', references: [] },
      },
    ]);
  });
});
