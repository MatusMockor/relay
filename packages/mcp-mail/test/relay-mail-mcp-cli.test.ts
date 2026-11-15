import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAIL_MCP_TOKEN_ENV, runRelayMailMcp } from '../src/cli/run-relay-mail-mcp';
import { MailToolSocketHost } from '../src/socket/mail-tool-socket-host';
import { thread, USER_A } from './support/fixtures';
import { InMemoryMail } from './support/in-memory-mail';
import { backendFor, firstText } from './support/mcp-client';
import { StreamClientTransport } from './support/stream-client-transport';

describe('relay-mail-mcp CLI', () => {
  let dir: string;
  let socketPath: string;
  let host: MailToolSocketHost;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-mcp-cli-'));
    socketPath = join(dir, 'mail.sock');
    const mail = new InMemoryMail();
    mail.addThread(USER_A, thread('thr_1', { subject: 'Faktúra' }));
    host = new MailToolSocketHost({
      path: socketPath,
      token: 'cli-secret',
      backend: backendFor(mail, USER_A),
    });
    await host.listen();
  });

  afterEach(async () => {
    await host.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('serves the mail tools over stdio backed by the host socket', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const running = await runRelayMailMcp({
      argv: ['--socket', socketPath],
      env: { [MAIL_MCP_TOKEN_ENV]: 'cli-secret' },
      stdin,
      stdout,
    });
    const client = new Client({ name: 'relay-cli-test', version: '0.0.0' });
    await client.connect(new StreamClientTransport(stdout, stdin));

    const result = await client.callTool({ name: 'list_folder', arguments: { view: 'inbox' } });

    expect(firstText(result.content)).toContain('"threadId":"thr_1"');
    await client.close();
    await running.close();
  });

  it('requires the socket path and the token', async () => {
    await expect(runRelayMailMcp({ argv: [], env: { [MAIL_MCP_TOKEN_ENV]: 'x' } })).rejects.toThrow(
      'Missing --socket <path>',
    );
    await expect(runRelayMailMcp({ argv: ['--socket', socketPath], env: {} })).rejects.toThrow(
      MAIL_MCP_TOKEN_ENV,
    );
  });

  it('fails cleanly with a wrong token', async () => {
    await expect(
      runRelayMailMcp({ argv: ['--socket', socketPath], env: { [MAIL_MCP_TOKEN_ENV]: 'bad' } }),
    ).rejects.toThrow('Invalid mail tools token');
  });
});
