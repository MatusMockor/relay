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

const OFFER = 'Cenová ponuka';

const rawMail = (to: string): Buffer =>
  Buffer.from(
    [
      'From: Obchod <obchod@firma.test>',
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(OFFER).toString('base64')}?=`,
      'Message-ID: <offer-1@firma.test>',
      'Date: Sat, 14 Nov 2026 08:00:00 +0000',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Dobrý deň.',
    ].join('\r\n'),
  );

describe('local mode move to folder (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;
  let folderPath: string;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    folderPath = await withImap(mailbox, async (client) => {
      const created = await client.mailboxCreate(['Obchod', 'Ponuky']);
      await client.append('INBOX', rawMail(mailbox.email));
      return created.path;
    });
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('moves an inbox thread into a folder, keeps it there after sync and undoes the move', async () => {
    const { bridge } = harness;
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const mailboxes = expectOk(
      await bridge.invoke('local.accounts.mailboxes', { accountId: account.id }),
    );
    const folder = mailboxes.find((candidate) => candidate.path === folderPath);
    const [thread] = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' })).items;
    expect(folder?.role).toBe('custom');
    expect(thread?.subject).toBe(OFFER);
    if (folder === undefined || thread === undefined) {
      return;
    }

    const moved = expectOk(
      await bridge.invoke('local.threads.action', {
        threadId: thread.id,
        action: { type: 'move', mailboxId: folder.id },
      }),
    );

    expect(moved.state).toBe('done');
    expect(await subjectsIn(mailbox, folderPath)).toEqual([OFFER]);
    expect(await subjectsIn(mailbox, 'INBOX')).toEqual([]);
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const listed = expectOk(
      await bridge.invoke('local.threads.list', { view: 'mailbox', mailboxId: folder.id }),
    );
    expect(listed.items.map((item) => [item.id, item.state])).toEqual([[thread.id, 'done']]);

    const undone = expectOk(
      await bridge.invoke('local.threads.action', {
        threadId: thread.id,
        action: { type: 'undoMove' },
      }),
    );

    expect(undone.state).toBe('inbox');
    expect(await subjectsIn(mailbox, folderPath)).toEqual([]);
    expect(await subjectsIn(mailbox, 'INBOX')).toEqual([OFFER]);
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const inbox = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    expect(inbox.items.map((item) => item.id)).toEqual([thread.id]);
  });
});
