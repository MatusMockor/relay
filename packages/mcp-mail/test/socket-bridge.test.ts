import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailToolBackend } from '../src/backend/mail-tool-backend';
import { MailToolSocketHost } from '../src/socket/mail-tool-socket-host';
import { SocketMailToolBackend } from '../src/socket/socket-mail-tool-backend';
import { thread, USER_A, message } from './support/fixtures';
import { InMemoryMail } from './support/in-memory-mail';
import { backendFor, connectInMemory, firstText } from './support/mcp-client';

describe('local socket bridge', () => {
  let dir: string;
  let socketPath: string;
  let host: MailToolSocketHost;
  let mail: InMemoryMail;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-mcp-sock-'));
    socketPath = join(dir, 'mail.sock');
    mail = new InMemoryMail();
    mail.addThread(USER_A, thread('thr_1', { subject: 'Faktúra' }), [message('msg_1', 'thr_1')]);
    host = new MailToolSocketHost({
      path: socketPath,
      token: 'secret',
      backend: backendFor(mail, USER_A),
    });
    await host.listen();
  });

  afterEach(async () => {
    await host.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('proxies MCP tool calls through the socket to the host backend', async () => {
    const remote = await SocketMailToolBackend.connect(socketPath, 'secret');
    const connected = await connectInMemory(remote);

    const search = await connected.client.callTool({
      name: 'search_threads',
      arguments: { query: 'faktúra' },
    });
    const detail = await connected.client.callTool({
      name: 'get_thread',
      arguments: { threadId: 'thr_1' },
    });
    const missing = await connected.client.callTool({
      name: 'get_thread',
      arguments: { threadId: 'thr_x' },
    });
    await connected.client.callTool({ name: 'create_task', arguments: { title: 'Zaplatiť' } });

    expect(firstText(search.content)).toContain('"threadId":"thr_1"');
    expect(firstText(detail.content)).toContain('Faktúra je v prílohe.');
    expect(missing.isError).toBe(true);
    expect(mail.tasks).toEqual([expect.objectContaining({ title: 'Zaplatiť', userId: USER_A })]);
    await connected.close();
    remote.close();
  });

  it('surfaces host errors as rejected calls', async () => {
    const remote = await SocketMailToolBackend.connect(socketPath, 'secret');

    await expect(remote.listTasks({ state: null, cursor: null, limit: 0 })).rejects.toThrow();
    remote.close();
  });

  it('rejects the connect when the peer hangs up before the handshake', async () => {
    const silentPath = join(dir, 'silent.sock');
    const silent = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) => silent.listen(silentPath, resolve));

    await expect(SocketMailToolBackend.connect(silentPath, 'secret')).rejects.toThrow(
      'before the handshake',
    );
    await new Promise<void>((resolve) =>
      silent.close(() => {
        resolve();
      }),
    );
  });

  it('times out a handshake and a request the peer never answers', async () => {
    const mutePath = join(dir, 'mute.sock');
    const mute = createServer((socket) => socket.resume());
    await new Promise<void>((resolve) => mute.listen(mutePath, resolve));

    await expect(
      SocketMailToolBackend.connect(mutePath, 'secret', { handshakeTimeoutMs: 100 }),
    ).rejects.toThrow('handshake timed out');
    await new Promise<void>((resolve) =>
      mute.close(() => {
        resolve();
      }),
    );

    const lazyPath = join(dir, 'lazy.sock');
    const lazy = createServer((socket) => {
      socket.once('data', () => socket.write('{"type":"ready"}\n'));
    });
    await new Promise<void>((resolve) => lazy.listen(lazyPath, resolve));
    const remote = await SocketMailToolBackend.connect(lazyPath, 'secret', {
      requestTimeoutMs: 100,
    });

    await expect(remote.getThread(thread('thr_1').id)).rejects.toThrow('getThread timed out');
    remote.close();
    await new Promise<void>((resolve) =>
      lazy.close(() => {
        resolve();
      }),
    );
  });

  it('rejects a wrong token', async () => {
    await expect(SocketMailToolBackend.connect(socketPath, 'nope')).rejects.toThrow(
      'Invalid mail tools token',
    );
  });

  it('fails pending and later calls once the host goes away', async () => {
    const real = backendFor(mail, USER_A);
    let received!: () => void;
    const requestArrived = new Promise<void>((resolve) => {
      received = resolve;
    });
    const stalled: MailToolBackend = {
      listFolder: (query) => real.listFolder(query),
      getThread: () => {
        received();
        return new Promise(() => undefined);
      },
      listTasks: (query) => real.listTasks(query),
      createTask: (task) => real.createTask(task),
      createDraft: (content) => real.createDraft(content),
    };
    const stalledPath = join(dir, 'stalled.sock');
    const stalledHost = new MailToolSocketHost({
      path: stalledPath,
      token: 'secret',
      backend: stalled,
    });
    await stalledHost.listen();
    const remote = await SocketMailToolBackend.connect(stalledPath, 'secret', {
      requestTimeoutMs: 10_000,
    });
    const outstanding = expect(remote.getThread(thread('thr_1').id)).rejects.toThrow(
      'connection closed',
    );
    await requestArrived;

    await stalledHost.close();

    await outstanding;
    await expect(remote.getThread(thread('thr_1').id)).rejects.toThrow('connection closed');
  });
});
