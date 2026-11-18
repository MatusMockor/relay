import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import type { AccountId, Mailbox, ThreadAction, ThreadId } from '@relay/shared/domain';
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

const INVOICE = 'Faktura 2026-11';

describe('moving a thread to a folder over the server', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let ownerImap: ImapFlow;
  let folderPath: string;

  beforeAll(async () => {
    owner = await createGreenMailUser('move');
    ownerImap = await openImap(owner);
    folderPath = (await ownerImap.mailboxCreate(['Účty', 'Faktúry'])).path;
    await ownerImap.append(
      'INBOX',
      rawMail({ from: 'uctovnik@firma.test', to: owner.email, subject: INVOICE, body: 'Ahoj' }),
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

  const act = (token: string, id: ThreadId, body: ThreadAction) =>
    app.api.ok(api.threads.action, { params: { id }, body }, token);

  const folderThreads = async (token: string, mailbox: Mailbox) =>
    (
      await app.api.ok(
        api.threads.list,
        { query: { view: 'mailbox', mailboxId: mailbox.id } },
        token,
      )
    ).items.map((thread) => thread.subject);

  it('moves an inbox thread into a nested folder and undoes the move', async () => {
    const token = (await registerUser(app.api, `move-${owner.email}`)).accessToken;
    const account = await addImapAccount(app.api, token, owner);
    const [invoice] = await waitForInbox(app.api, token, (items) => items.length === 1);
    const folder = (await mailboxes(token, account.id)).find(({ path }) => path === folderPath);
    expect(invoice?.subject).toBe(INVOICE);
    expect(folder?.role).toBe('custom');
    if (invoice === undefined || folder === undefined) {
      return;
    }

    const moved = await act(token, invoice.id, { type: 'move', mailboxId: folder.id });

    expect(moved.state).toBe('done');
    expect(await listSubjects(ownerImap, folderPath)).toEqual([INVOICE]);
    expect(await listSubjects(ownerImap, 'INBOX')).toEqual([]);
    expect(await folderThreads(token, folder)).toEqual([INVOICE]);
    const inbox = await app.api.ok(api.threads.list, { query: { view: 'inbox' } }, token);
    expect(inbox.items).toEqual([]);

    const undone = await act(token, invoice.id, { type: 'undoMove' });

    expect(undone.state).toBe('inbox');
    expect(await listSubjects(ownerImap, folderPath)).toEqual([]);
    expect(await listSubjects(ownerImap, 'INBOX')).toEqual([INVOICE]);
    expect(await folderThreads(token, folder)).toEqual([]);
  }, 60_000);
});
