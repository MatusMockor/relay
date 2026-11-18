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

const CONTRACT = 'Zmluva Alfa';

const rawMail = (to: string, subject = CONTRACT, id = 'contract-1'): Buffer =>
  Buffer.from(
    [
      'From: Jana <jana@klient.test>',
      `To: ${to}`,
      `Subject: ${subject}`,
      `Message-ID: <${id}@klient.test>`,
      'Date: Sat, 14 Nov 2026 08:00:00 +0000',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Dobrý deň.',
    ].join('\r\n'),
  );

describe('local mode folder management (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;
  let alfaPath: string;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    alfaPath = await withImap(mailbox, async (client) => {
      await client.mailboxCreate('Projekty');
      const created = await client.mailboxCreate(['Projekty', 'Alfa']);
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

  it('creates, renames and deletes folders and keeps folder ids across a rename', async () => {
    const { bridge } = harness;
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const listed = expectOk(
      await bridge.invoke('local.accounts.mailboxes', { accountId: account.id }),
    );
    const projects = listed.find((candidate) => candidate.path === 'Projekty');
    const alfa = listed.find((candidate) => candidate.path === alfaPath);
    const inbox = listed.find((candidate) => candidate.role === 'inbox');
    if (projects === undefined || alfa === undefined || inbox === undefined) {
      expect({ projects, alfa, inbox }).toBeNull();
      return;
    }
    const delimiter = alfa.delimiter ?? '.';
    const folderView = async () =>
      expectOk(await bridge.invoke('local.threads.list', { view: 'mailbox', mailboxId: alfa.id }))
        .items;
    const [contract] = await folderView();
    expect(contract?.subject).toBe(CONTRACT);

    const created = expectOk(
      await bridge.invoke('local.mailboxes.create', {
        accountId: account.id,
        body: { name: 'Faktúry', parentId: projects.id },
      }),
    );
    expect(created).toMatchObject({ path: `Projekty${delimiter}Faktúry`, role: 'custom' });

    const renamed = expectOk(
      await bridge.invoke('local.mailboxes.update', {
        mailboxId: projects.id,
        patch: { name: 'Klienti' },
      }),
    );
    expect(renamed).toMatchObject({ id: projects.id, path: 'Klienti' });
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const after = expectOk(
      await bridge.invoke('local.accounts.mailboxes', { accountId: account.id }),
    );
    expect(after.find((candidate) => candidate.id === alfa.id)?.path).toBe(
      `Klienti${delimiter}Alfa`,
    );
    expect((await folderView()).map((thread) => thread.id)).toEqual([contract?.id]);

    const forbidden = await bridge.invoke('local.mailboxes.update', {
      mailboxId: inbox.id,
      patch: { name: 'Pošta' },
    });
    expect(forbidden).toMatchObject({ ok: false, error: { code: 'forbidden' } });

    expectOk(await bridge.invoke('local.mailboxes.delete', { mailboxId: alfa.id }));

    expect(await subjectsIn(mailbox, 'Trash')).toEqual([CONTRACT]);
    const trash = expectOk(await bridge.invoke('local.threads.list', { view: 'trash' }));
    expect(trash.items.map((thread) => thread.subject)).toEqual([CONTRACT]);
    const remaining = expectOk(
      await bridge.invoke('local.accounts.mailboxes', { accountId: account.id }),
    );
    expect(remaining.some((candidate) => candidate.id === alfa.id)).toBe(false);
  });

  it('moves every server message of a deleted folder to Trash, also uncached ones', async () => {
    const { bridge } = harness;
    const archivePath = await withImap(mailbox, async (client) => {
      const created = await client.mailboxCreate('Archív 2020');
      for (let index = 0; index < 201; index += 1) {
        await client.append(
          created.path,
          rawMail(mailbox.email, `Starý ${String(index)}`, `old-${String(index)}`),
        );
      }
      return created.path;
    });
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    const folder = expectOk(
      await bridge.invoke('local.accounts.mailboxes', { accountId: account.id }),
    ).find((candidate) => candidate.path === archivePath);
    if (folder === undefined) {
      expect(folder).toBeDefined();
      return;
    }
    const cached = expectOk(
      await bridge.invoke('local.threads.list', {
        view: 'mailbox',
        mailboxId: folder.id,
        limit: 200,
      }),
    );
    expect(cached.items).toHaveLength(200);
    expect(cached.nextCursor).toBeNull();

    expectOk(await bridge.invoke('local.mailboxes.delete', { mailboxId: folder.id }));

    expect(await subjectsIn(mailbox, 'Trash')).toHaveLength(201);
    const remaining = await withImap(mailbox, async (client) =>
      (await client.list()).map((listed) => listed.path),
    );
    expect(remaining).not.toContain(archivePath);
  }, 60_000);
});
