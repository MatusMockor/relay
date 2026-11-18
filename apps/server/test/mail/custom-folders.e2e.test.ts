import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import type { AccountId, Mailbox } from '@relay/shared/domain';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import {
  createGreenMailUser,
  deleteGreenMailUser,
  listSubjects,
  openImap,
  rawMail,
} from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const CONTRACT = 'Zmluva Alfa';

describe('custom folders over the server', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let ownerImap: ImapFlow;
  let alfaPath: string;

  beforeAll(async () => {
    owner = await createGreenMailUser('folders');
    ownerImap = await openImap(owner);
    const created = await ownerImap.mailboxCreate(['Projekty', 'Alfa']);
    alfaPath = created.path;
    await ownerImap.append(
      alfaPath,
      rawMail({ from: 'jana@klient.test', to: owner.email, subject: CONTRACT, body: 'Ahoj' }),
    );
    await ownerImap.append(
      'INBOX',
      rawMail({ from: 'jana@klient.test', to: owner.email, subject: 'Porada', body: 'O 10' }),
    );
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
    await ownerImap.logout();
    await deleteGreenMailUser(owner);
  });

  const mailboxes = (token: string, accountId: AccountId): Promise<Mailbox[]> =>
    app.api.ok(api.accounts.mailboxes, { params: { id: accountId } }, token);

  const resync = async (token: string, accountId: AccountId): Promise<void> => {
    app.clock.advance(1000);
    const expected = app.clock.now().toISOString();
    await app.api.ok(api.sync.now, { body: { accountId } }, token);
    await expect
      .poll(
        async () =>
          (await app.api.ok(api.accounts.list, {}, token)).find((item) => item.id === accountId)
            ?.lastSyncedAt,
        { timeout: 10_000 },
      )
      .toBe(expected);
  };

  const folderThreads = async (token: string, mailbox: Mailbox) =>
    (
      await app.api.ok(
        api.threads.list,
        { query: { view: 'mailbox', mailboxId: mailbox.id } },
        token,
      )
    ).items;

  it('lists a nested folder, trashes from it, restores into it and survives a rename', async () => {
    const token = (await registerUser(app.api, `folders-${owner.email}`)).accessToken;
    const account = await addImapAccount(app.api, token, owner);
    await waitForInbox(app.api, token, (items) => items.length === 1);
    await resync(token, account.id);

    const listed = await mailboxes(token, account.id);
    const alfa = listed.find((mailbox) => mailbox.path === alfaPath);
    expect(alfa).toMatchObject({ role: 'custom', subscribed: true, totalCount: 1 });
    if (alfa === undefined) {
      return;
    }
    const [contract] = await folderThreads(token, alfa);
    expect(contract?.subject).toBe(CONTRACT);
    expect(contract?.state).toBe('done');
    if (contract === undefined) {
      return;
    }

    await app.api.ok(
      api.threads.action,
      { params: { id: contract.id }, body: { type: 'trash' } },
      token,
    );
    expect(await listSubjects(ownerImap, alfaPath)).toEqual([]);
    expect(await listSubjects(ownerImap, 'Trash')).toEqual([CONTRACT]);
    await app.api.ok(
      api.threads.action,
      { params: { id: contract.id }, body: { type: 'restore' } },
      token,
    );
    expect(await listSubjects(ownerImap, alfaPath)).toEqual([CONTRACT]);
    await resync(token, account.id);
    await expect
      .poll(async () => (await mailboxes(token, account.id)).find((m) => m.id === alfa.id))
      .toMatchObject({ totalCount: 1 });

    const renamed = await ownerImap.mailboxRename('Projekty', 'Klienti');
    expect(renamed.newPath).toBe('Klienti');
    await resync(token, account.id);
    const relocated = `Klienti${alfa.delimiter ?? '.'}Alfa`;
    await expect
      .poll(async () => (await mailboxes(token, account.id)).find((m) => m.id === alfa.id)?.path, {
        timeout: 10_000,
      })
      .toBe(relocated);
    const after = { ...alfa, path: relocated };
    expect((await folderThreads(token, after)).map((thread) => thread.id)).toEqual([contract.id]);
  }, 60_000);
});
