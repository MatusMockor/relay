import { writeFile } from 'node:fs/promises';
import { CliDetector, CliLocator, createCliRunnerRegistry } from '@relay/ai';
import { ThreadIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGreenMailAccount, deliverMail, type GreenMailAccount } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { runAi } from './support/run-ai';
import { imapAccountBody } from './support/seed-account';
import { installStubClaude, type StubClaude } from './support/stub-claude';
import { startStubGoogleTokenEndpoint, type StubGoogle } from './support/stub-google';
import { createTempDir, type TempDir } from './support/temp-dir';

describe('local AI runs and Google sign-in in local mode', () => {
  let dir: TempDir;
  let claude: StubClaude;
  let google: StubGoogle;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    claude = await installStubClaude();
    google = await startStubGoogleTokenEndpoint('jana@gmail.com');
    mailbox = await createGreenMailAccount();
    await deliverMail(mailbox, {
      from: 'Jana <jana@example.com>',
      subject: 'Faktúra za október',
      text: 'Posielam faktúru.',
    });
    await writeFile(
      dir.file('google-oauth.json'),
      JSON.stringify({ clientId: 'desktop-client', tokenEndpoint: google.tokenEndpoint }),
    );
    const detector = new CliDetector({
      locator: new CliLocator({ pathEnv: claude.dir, extraDirs: [] }),
    });
    harness = startLocalRuntime(dir, {
      withMailTools: true,
      aiRunners: createCliRunnerRegistry({ location: 'local', detector }),
    });
    await harness.runtime.start();
  });

  afterEach(async () => {
    harness.logs.records
      .filter((record) => record.level === 'error')
      .forEach((record) => {
        console.error(record.message, record.context);
      });
    await harness.close();
    await mailbox.remove();
    await google.close();
    await claude.dispose();
    await dir.remove();
  });

  it('detects the local CLIs', async () => {
    const result = await harness.bridge.invoke('ai.detectRunners');
    expect(result.ok && result.data.find((info) => info.runner === 'claude')).toMatchObject({
      installed: true,
      authenticated: true,
      location: 'local',
      version: '2.1.0',
    });
    expect(result.ok && result.data.find((info) => info.runner === 'codex')).toMatchObject({
      installed: false,
    });
  });

  it('streams a local AI run with the mail MCP server attached', async () => {
    const { bridge } = harness;
    const account = await bridge.invoke('local.accounts.create', imapAccountBody(mailbox));
    expect(account.ok).toBe(true);
    await bridge.invoke('local.sync.now', {});
    const page = await bridge.invoke('local.threads.list', { view: 'inbox' });
    const thread = page.ok ? page.data.items[0] : undefined;
    expect(thread).toBeDefined();

    const summary = await runAi(bridge, {
      input: { kind: 'summary', threadId: thread?.id ?? ThreadIdSchema.parse('missing') },
      runner: 'claude',
    });
    expect(summary.error).toBeNull();
    expect(summary.events[0]).toEqual({ type: 'started', runner: 'claude' });
    expect(summary.events.at(-1)).toEqual({
      type: 'completed',
      output: expect.objectContaining({
        kind: 'summary',
        summary: 'Jana posiela faktúru za október.',
      }) as unknown,
    });

    const [call] = await claude.calls();
    const mcp = JSON.parse(call?.mcpConfig ?? '{}') as {
      mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
    };
    const server = Object.values(mcp.mcpServers)[0];
    expect(server?.command).toBe(process.execPath);
    expect(server?.args).toContain('--socket');
    expect(server?.env.RELAY_MAIL_MCP_TOKEN).toBe(
      harness.runtime.mailToolsEndpoint?.env.RELAY_MAIL_MCP_TOKEN,
    );
  });

  it('runs AI locally in local mode even when the stored setting says server', async () => {
    const { bridge } = harness;
    const updated = await bridge.invoke('local.settings.update', { ai: { location: 'server' } });
    expect(updated).toMatchObject({ ok: true, data: { ai: { location: 'local' } } });
    const outcome = await runAi(bridge, {
      input: { kind: 'rewrite', text: 'ahoj', instruction: 'formálne', draftId: null },
    });
    expect(outcome.error).toBeNull();
    expect(outcome.events.at(-1)).toMatchObject({
      type: 'completed',
      output: { kind: 'rewrite', text: 'Dobrý deň, ďakujem za správu.' },
    });
    expect(await claude.calls()).toHaveLength(1);
  });

  it('signs in with Google over the loopback flow and creates a local Gmail account', async () => {
    const result = await harness.bridge.invoke('oauth.google.authorize', { mode: 'local' });
    expect(result).toMatchObject({
      ok: true,
      data: { mode: 'local', account: { provider: 'gmail', email: 'jana@gmail.com' } },
    });
    const accounts = await harness.bridge.invoke('local.accounts.list');
    const gmail = accounts.ok ? accounts.data[0] : undefined;
    expect(gmail?.settings.imap.host).toBe('imap.gmail.com');
    expect(gmail).toBeDefined();
    const credentials =
      gmail === undefined ? null : await harness.runtime.infrastructure.vault.get(gmail.id);
    expect(credentials).toMatchObject({
      kind: 'oauth',
      provider: 'gmail',
      refreshToken: 'refresh-1',
    });
    expect(google.tokenRequests[0]?.get('client_id')).toBe('desktop-client');
  });
});
