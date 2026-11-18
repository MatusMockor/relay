import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createGreenMailAccount,
  type GreenMailAccount,
  subjectsIn,
  withImap,
} from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

const INVOICE = 'Faktúra 2026/11';

const rawMail = (to: string): Buffer =>
  Buffer.from(
    [
      'From: Účtáreň <uctaren@firma.test>',
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(INVOICE).toString('base64')}?=`,
      'Message-ID: <invoice-1@firma.test>',
      'Date: Sat, 14 Nov 2026 08:00:00 +0000',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Dobrý deň.',
    ].join('\r\n'),
  );

describe('local mode custom folders (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;
  let folderPath: string;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    folderPath = await withImap(mailbox, async (client) => {
      const created = await client.mailboxCreate(['Účty', 'Faktúry']);
      await client.append(created.path, rawMail(mailbox.email));
      return created.path;
    });
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('syncs a nested folder, lists its threads and restores trashed mail into it', async () => {
    const { bridge } = harness;
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));

    const mailboxes = expectOk(
      await bridge.invoke('local.accounts.mailboxes', { accountId: account.id }),
    );
    const folder = mailboxes.find((candidate) => candidate.path === folderPath);
    expect(folder).toMatchObject({ role: 'custom', name: 'Faktúry', subscribed: true });
    if (folder === undefined) {
      return;
    }
    const listed = expectOk(
      await bridge.invoke('local.threads.list', { view: 'mailbox', mailboxId: folder.id }),
    );
    expect(listed.items.map((thread) => thread.subject)).toEqual([INVOICE]);
    const [thread] = listed.items;
    if (thread === undefined) {
      return;
    }
    expect(thread.state).toBe('done');
    const inbox = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    expect(inbox.items).toEqual([]);

    expectOk(
      await bridge.invoke('local.threads.action', {
        threadId: thread.id,
        action: { type: 'trash' },
      }),
    );
    expect(await subjectsIn(mailbox, folderPath)).toEqual([]);
    expectOk(
      await bridge.invoke('local.threads.action', {
        threadId: thread.id,
        action: { type: 'restore' },
      }),
    );
    expect(await subjectsIn(mailbox, folderPath)).toEqual([INVOICE]);
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const back = expectOk(
      await bridge.invoke('local.threads.list', { view: 'mailbox', mailboxId: folder.id }),
    );
    expect(back.items.map((item) => item.id)).toEqual([thread.id]);
  });

  it('rejects a mailbox view without a mailbox id', async () => {
    const result = await harness.bridge.invoke('local.threads.list', { view: 'mailbox' });
    expect(result).toMatchObject({ ok: false });
  });
});
