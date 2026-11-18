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

describe('managing folders over the server', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let ownerImap: ImapFlow;
  let alfaPath: string;

  beforeAll(async () => {
    owner = await createGreenMailUser('manage');
    ownerImap = await openImap(owner);
    await ownerImap.mailboxCreate('Projekty');
    alfaPath = (await ownerImap.mailboxCreate(['Projekty', 'Alfa'])).path;
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

  const folderSubjects = async (token: string, mailbox: Mailbox) =>
    (
      await app.api.ok(
        api.threads.list,
        { query: { view: 'mailbox', mailboxId: mailbox.id } },
        token,
      )
    ).items.map((thread) => thread.subject);

  const remotePaths = async () =>
    (await ownerImap.list()).map((mailbox) => mailbox.path).filter((path) => path !== 'INBOX');

  it('creates, renames, moves and deletes folders on the mail server', async () => {
    const token = (await registerUser(app.api, `manage-${owner.email}`)).accessToken;
    const account = await addImapAccount(app.api, token, owner);
    await waitForInbox(app.api, token, (items) => items.length === 1);
    await expect
      .poll(async () => (await mailboxes(token, account.id)).some((m) => m.path === alfaPath), {
        timeout: 10_000,
      })
      .toBe(true);
    const listed = await mailboxes(token, account.id);
    const projects = listed.find((mailbox) => mailbox.path === 'Projekty');
    const alfa = listed.find((mailbox) => mailbox.path === alfaPath);
    const inbox = listed.find((mailbox) => mailbox.role === 'inbox');
    if (projects === undefined || alfa === undefined || inbox === undefined) {
      expect({ projects, alfa, inbox }).toBeNull();
      return;
    }
    const delimiter = alfa.delimiter ?? '.';

    const nested = await app.api.ok(
      api.folders.create,
      { params: { id: account.id }, body: { name: 'Beta', parentId: projects.id } },
      token,
    );
    expect(nested).toMatchObject({ path: `Projekty${delimiter}Beta`, role: 'custom' });
    const created = await app.api.ok(
      api.folders.create,
      { params: { id: account.id }, body: { name: 'Faktúry', parentId: null } },
      token,
    );
    expect(created).toMatchObject({ path: 'Faktúry', role: 'custom' });
    const clash = await app.api.fail(
      api.folders.create,
      { params: { id: account.id }, body: { name: 'projekty', parentId: null } },
      token,
    );
    expect(clash.status).toBe(409);
    const system = await app.api.fail(
      api.folders.update,
      { params: { id: inbox.id }, body: { name: 'Pošta' } },
      token,
    );
    expect(system.status).toBe(403);
    expect(system.error.message).toBe('Systémový priečinok nie je možné upraviť');

    const renamed = await app.api.ok(
      api.folders.update,
      { params: { id: projects.id }, body: { name: 'Klienti' } },
      token,
    );
    expect(renamed).toMatchObject({ id: projects.id, path: 'Klienti' });
    const movedAlfa = (await mailboxes(token, account.id)).find((m) => m.id === alfa.id);
    expect(movedAlfa?.path).toBe(`Klienti${delimiter}Alfa`);
    expect(await folderSubjects(token, alfa)).toEqual([CONTRACT]);
    expect((await remotePaths()).sort()).toEqual(
      ['Faktúry', 'Klienti', `Klienti${delimiter}Alfa`, `Klienti${delimiter}Beta`].sort(),
    );

    const moved = await app.api.ok(
      api.folders.update,
      { params: { id: created.id }, body: { parentId: projects.id } },
      token,
    );
    expect(moved).toMatchObject({ id: created.id, path: `Klienti${delimiter}Faktúry` });
    expect(await remotePaths()).toContain(`Klienti${delimiter}Faktúry`);

    await app.api.ok(api.folders.remove, { params: { id: alfa.id } }, token);

    expect(await listSubjects(ownerImap, 'Trash')).toEqual([CONTRACT]);
    expect(await remotePaths()).not.toContain(`Klienti${delimiter}Alfa`);
    expect((await mailboxes(token, account.id)).some((m) => m.id === alfa.id)).toBe(false);
    const trash = await app.api.ok(api.threads.list, { query: { view: 'trash' } }, token);
    expect(trash.items.map((thread) => thread.subject)).toEqual([CONTRACT]);
  }, 60_000);
});
