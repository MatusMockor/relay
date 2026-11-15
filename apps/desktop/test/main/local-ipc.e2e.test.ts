import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createGreenMailAccount,
  deliverMail,
  type GreenMailAccount,
  subjectsIn,
  withImap,
} from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody, seedImapAccount } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

const required = <T>(value: T | undefined): T => {
  expect(value).toBeDefined();
  return value as T;
};

describe('local mode IPC through the engine (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    await withImap(mailbox, async (client) => {
      await client.mailboxCreate('Archive');
    });
    await deliverMail(mailbox, {
      from: 'Jana Nováková <jana@example.com>',
      subject: 'Faktúra za október',
      text: 'Dobrý deň, posielam faktúru.',
    });
    await deliverMail(mailbox, {
      from: 'Peter <peter@example.com>',
      subject: 'Obed v piatok?',
      text: 'Ideme na obed?',
    });
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('adds an IMAP account, syncs it, lists threads and mirrors done to the server', async () => {
    const { bridge } = harness;
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    expect(account).toMatchObject({ email: mailbox.email, displayName: 'Práca', isPrimary: true });
    const accounts = expectOk(await bridge.invoke('local.accounts.list'));
    expect(accounts.map((entry) => entry.id)).toEqual([account.id]);

    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));

    const page = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    expect(page.items.map((thread) => thread.subject).sort()).toEqual([
      'Faktúra za október',
      'Obed v piatok?',
    ]);
    const invoice = page.items.find((thread) => thread.subject === 'Faktúra za október');
    expect(invoice?.unread).toBe(true);
    expect(invoice?.participants[0]?.email).toBe('jana@example.com');

    const detail = expectOk(
      await bridge.invoke('local.threads.get', { threadId: required(invoice).id }),
    );
    expect(detail.messages).toHaveLength(1);
    expect(detail.messages[0]?.textBody?.trim()).toBe('Dobrý deň, posielam faktúru.');

    const done = expectOk(
      await bridge.invoke('local.threads.action', {
        threadId: detail.thread.id,
        action: { type: 'done' },
      }),
    );
    expect(done.state).toBe('done');

    expect(await subjectsIn(mailbox, 'INBOX')).toEqual(['Obed v piatok?']);
    expect(await subjectsIn(mailbox, 'Archive')).toEqual(['Faktúra za október']);

    const inbox = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    expect(inbox.items.map((thread) => thread.subject)).toEqual(['Obed v piatok?']);
    const archived = expectOk(await bridge.invoke('local.threads.list', { view: 'done' }));
    expect(archived.items.map((thread) => thread.subject)).toEqual(['Faktúra za október']);

    const mailboxes = expectOk(
      await bridge.invoke('local.accounts.mailboxes', { accountId: account.id }),
    );
    expect(mailboxes.map((entry) => entry.role)).toEqual(
      expect.arrayContaining(['inbox', 'archive']),
    );

    const types = new Set(harness.events.map((event) => event.type));
    expect(types).toContain('account.upserted');
    expect(types).toContain('thread.upserted');
    expect(types).toContain('account.status');
  });

  it('marks a thread read locally and on the server', async () => {
    const { bridge, runtime } = harness;
    const account = await seedImapAccount(runtime, mailbox);
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const page = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    const lunch = page.items.find((thread) => thread.subject === 'Obed v piatok?');
    const read = expectOk(
      await bridge.invoke('local.threads.action', {
        threadId: required(lunch).id,
        action: { type: 'markRead' },
      }),
    );
    expect(read.unread).toBe(false);
    const seen = await withImap(mailbox, async (client) => {
      const lock = await client.getMailboxLock('INBOX');
      try {
        return await client.search({ seen: true, subject: 'Obed' }, { uid: true });
      } finally {
        lock.release();
      }
    });
    expect(seen).toHaveLength(1);
  });

  it('surfaces a failed sync to the renderer and marks the account as failing', async () => {
    const { bridge, runtime } = harness;
    const account = await seedImapAccount(runtime, mailbox, 1);
    const result = await bridge.invoke('local.sync.now', { accountId: account.id });
    expect(result).toMatchObject({ ok: false, error: { code: 'provider_error' } });
    const statuses = harness.events.flatMap((event) =>
      event.type === 'account.status' ? [event.data.status] : [],
    );
    expect(statuses).toContain('error');
  });

  it('reads and updates user settings and splits through the engine', async () => {
    const { bridge } = harness;
    const settings = expectOk(await bridge.invoke('local.settings.get'));
    expect(settings.ai.location).toBe('local');
    const updated = expectOk(
      await bridge.invoke('local.settings.update', {
        notifications: 'digest',
        ai: { defaultRunner: 'codex' },
      }),
    );
    expect(updated).toMatchObject({ notifications: 'digest', ai: { defaultRunner: 'codex' } });
    expect(harness.events.map((event) => event.type)).toContain('settings.updated');

    const splits = expectOk(
      await bridge.invoke('local.splits.replace', {
        splits: [
          {
            accountId: null,
            name: 'Jira',
            order: 0,
            rules: [{ type: 'fromDomain', domain: 'atlassian.net' }],
            exclusive: true,
          },
        ],
      }),
    );
    expect(splits.map((split) => split.name)).toEqual(['Jira']);
    const listed = expectOk(await bridge.invoke('local.splits.list'));
    expect(listed.map((split) => split.id)).toEqual(splits.map((split) => split.id));
  });

  it('keeps server tokens and device settings for the renderer apart from account credentials', async () => {
    const { bridge } = harness;
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    expectOk(await bridge.invoke('secure.set', { key: 'server.refresh-token', value: 'r-123' }));
    expect(expectOk(await bridge.invoke('secure.get', { key: 'server.refresh-token' }))).toEqual({
      value: 'r-123',
    });
    expect(expectOk(await bridge.invoke('secure.get', { key: account.id }))).toEqual({
      value: null,
    });
    expectOk(await bridge.invoke('secure.delete', { key: 'server.refresh-token' }));
    expect(expectOk(await bridge.invoke('secure.get', { key: 'server.refresh-token' }))).toEqual({
      value: null,
    });

    const device = expectOk(
      await bridge.invoke('settings.device.set', { mode: 'local', selectedAccountId: account.id }),
    );
    expect(device).toMatchObject({ mode: 'local', selectedAccountId: account.id });
    expect(expectOk(await bridge.invoke('settings.device.get'))).toEqual(device);
  });

  it('rejects invalid IPC input before it reaches the engine', async () => {
    const result = await harness.bridge.invoke('local.accounts.create', {
      ...imapAccountBody(mailbox),
      email: 'not-an-email',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
    expect(expectOk(await harness.bridge.invoke('local.accounts.list'))).toEqual([]);
  });
});
