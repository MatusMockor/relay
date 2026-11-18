import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import type { AccountId, Label } from '@relay/shared/domain';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap, rawMail } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const INVOICE = 'Faktura 2026-11';

const inboxFlags = async (client: ImapFlow): Promise<string[]> => {
  const lock = await client.getMailboxLock('INBOX');
  try {
    const flags = new Map<number, string[]>();
    for await (const message of client.fetch('1:*', { uid: true, flags: true })) {
      flags.set(message.uid, [...(message.flags ?? [])]);
    }
    return [...flags.values()].flat().sort();
  } finally {
    lock.release();
  }
};

describe('label management over the server', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let ownerImap: ImapFlow;

  beforeAll(async () => {
    owner = await createGreenMailUser('labels');
    ownerImap = await openImap(owner);
    await ownerImap.append(
      'INBOX',
      rawMail({ from: 'uctovnik@firma.test', to: owner.email, subject: INVOICE, body: 'Ahoj' }),
      ['Fakt&APo-ry'],
    );
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
    await ownerImap.logout();
    await deleteGreenMailUser(owner);
  });

  const labels = (token: string, accountId: AccountId): Promise<Label[]> =>
    app.api.ok(api.labels.list, { query: { accountId } }, token);

  it('creates, applies, renames and deletes keyword labels', async () => {
    const token = (await registerUser(app.api, `labels-${owner.email}`)).accessToken;
    const account = await addImapAccount(app.api, token, owner);
    const [invoice] = await waitForInbox(app.api, token, (items) => items.length === 1);
    const [synced] = await labels(token, account.id);
    expect(synced).toMatchObject({ name: 'Faktúry', remoteName: 'Faktúry', kind: 'keyword' });
    expect(invoice?.labelIds).toEqual([synced?.id]);
    if (invoice === undefined) {
      return;
    }

    const created = await app.api.ok(
      api.labels.create,
      { body: { accountId: account.id, name: 'Moje veci', color: '#22aa66' } },
      token,
    );
    expect(created).toMatchObject({ name: 'Moje veci', kind: 'keyword', color: '#22aa66' });
    const duplicate = await app.api.fail(
      api.labels.create,
      { body: { accountId: account.id, name: 'moje VECI' } },
      token,
    );
    expect(duplicate.status).toBe(409);

    const labelled = await app.api.ok(
      api.threads.action,
      { params: { id: invoice.id }, body: { type: 'addLabel', labelId: created.id } },
      token,
    );
    expect([...labelled.labelIds].sort()).toEqual([created.id, synced?.id].sort());
    expect(await inboxFlags(ownerImap)).toEqual(['Fakt&APo-ry', 'Moje&ACA-veci']);

    const renamed = await app.api.ok(
      api.labels.update,
      { params: { id: created.id }, body: { name: 'Osobné' } },
      token,
    );
    expect(renamed).toMatchObject({ id: created.id, name: 'Osobné', remoteName: 'Moje veci' });

    await app.api.ok(api.labels.remove, { params: { id: created.id } }, token);

    expect((await labels(token, account.id)).map((label) => label.name)).toEqual(['Faktúry']);
    expect(await inboxFlags(ownerImap)).toEqual(['Fakt&APo-ry']);
    const missing = await app.api.fail(api.labels.remove, { params: { id: created.id } }, token);
    expect(missing.status).toBe(404);
  }, 60_000);
});
