import { spawnSync } from 'node:child_process';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MailToolSocketHost } from '../src/socket/mail-tool-socket-host';
import { SocketMailToolBackend } from '../src/socket/socket-mail-tool-backend';
import { USER_A } from './support/fixtures';
import { InMemoryMail } from './support/in-memory-mail';
import { backendFor } from './support/mcp-client';

function closesWithin(socket: Socket, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
    socket.once('close', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function firstLine(socket: Socket): Promise<string> {
  return new Promise((resolve) => {
    let received = '';
    socket.on('data', (chunk: Buffer) => {
      received += chunk.toString('utf8');
      if (received.includes('\n')) {
        resolve(received.slice(0, received.indexOf('\n')));
      }
    });
  });
}

function connectRaw(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(path, () => {
      resolve(socket);
    });
    socket.once('error', reject);
  });
}

function leaveStaleSocket(path: string): void {
  const script = `require('node:net').createServer().listen(${JSON.stringify(path)}, () => process.kill(process.pid, 'SIGKILL'))`;
  spawnSync(process.execPath, ['-e', script]);
}

describe('mail tool socket host', () => {
  let dir: string;
  let path: string;
  let hosts: MailToolSocketHost[];

  function host(overrides: Partial<ConstructorParameters<typeof MailToolSocketHost>[0]> = {}) {
    const created = new MailToolSocketHost({
      path,
      token: 'secret',
      backend: backendFor(new InMemoryMail(), USER_A),
      ...overrides,
    });
    hosts.push(created);
    return created;
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-mcp-host-'));
    path = join(dir, 'mail.sock');
    hosts = [];
  });

  afterEach(async () => {
    await Promise.all(hosts.map((created) => created.close()));
    await rm(dir, { recursive: true, force: true });
  });

  it('drops a peer that sends an oversized frame before authenticating', async () => {
    await host({ maxFrameBytes: 1_024 }).listen();
    const socket = await connectRaw(path);
    const closed = closesWithin(socket, 2_000);

    socket.write('a'.repeat(4_096));

    expect(await closed).toBe(true);
  });

  it('reassembles a frame split across writes and accepts CRLF line ends', async () => {
    await host({ maxFrameBytes: 1_024 }).listen();
    const socket = await connectRaw(path);
    const reply = firstLine(socket);

    socket.write('{"type":"hel');
    socket.write('lo","token":"secret"}\r\n');

    expect(await reply).toBe('{"type":"ready"}');
    socket.destroy();
  });

  it('refuses to replace a path that is not a socket', async () => {
    await writeFile(path, 'keep me');

    await expect(host().listen()).rejects.toThrow('not a socket');
    expect(await readFile(path, 'utf8')).toBe('keep me');
  });

  it('refuses to take over a live endpoint and leaves it serving', async () => {
    await host().listen();

    await expect(host().listen()).rejects.toThrow('already in use');
    const remote = await SocketMailToolBackend.connect(path, 'secret');
    remote.close();
  });

  it('replaces a stale socket left by a crashed process', async () => {
    leaveStaleSocket(path);
    expect((await lstat(path)).isSocket()).toBe(true);

    await host().listen();

    const remote = await SocketMailToolBackend.connect(path, 'secret');
    remote.close();
  });

  it('rejects a second listen on a running host', async () => {
    const running = host();
    await running.listen();

    await expect(running.listen()).rejects.toThrow('already listening');
  });

  it('closes the bound server and releases the path when restricting access fails', async () => {
    const failing = host({ restrictAccess: () => Promise.reject(new Error('chmod failed')) });

    await expect(failing.listen()).rejects.toThrow('chmod failed');
    await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(connectRaw(path)).rejects.toMatchObject({ code: 'ENOENT' });
    await host().listen();
  });
});
