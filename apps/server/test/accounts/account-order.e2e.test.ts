import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import type { AccountId } from '@relay/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser } from '../support/greenmail';
import { addImapAccount } from '../support/mail-flow';
import { authenticateRealtime } from '../support/realtime-client';
import { startTestApp, type TestApp } from '../support/test-app';

const uniqueEmail = (): string => `order-${randomUUID().slice(0, 8)}@relay.test`;

describe('account order', () => {
  let app: TestApp;
  let mailboxes: GreenMailUser[];

  beforeAll(async () => {
    mailboxes = await Promise.all(['ord-a', 'ord-b', 'ord-c', 'ord-d'].map(createGreenMailUser));
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
    await Promise.all(mailboxes.map(deleteGreenMailUser));
  });

  const mailbox = (index: number): GreenMailUser => {
    const found = mailboxes[index];
    expect(found).toBeDefined();
    return found as GreenMailUser;
  };

  it('stores the order chosen by the user and appends new accounts', async () => {
    const token = (await registerUser(app.api, uniqueEmail())).accessToken;
    const work = await addImapAccount(app.api, token, mailbox(0), 'Práca');
    const home = await addImapAccount(app.api, token, mailbox(1), 'Domov');
    const club = await addImapAccount(app.api, token, mailbox(2), 'Klub');
    const socket = await authenticateRealtime(app.baseUrl, token);

    const reordered = await app.api.ok(
      api.accounts.reorder,
      { body: { accountIds: [club.id, work.id, home.id] } },
      token,
    );

    expect(reordered.map((account) => account.id)).toEqual([club.id, work.id, home.id]);
    expect(reordered.find((account) => account.id === work.id)?.isPrimary).toBe(true);
    await socket.waitFor(
      (message) =>
        message.type === 'event' &&
        message.event.type === 'accounts.reordered' &&
        message.event.data.accountIds.join() === [club.id, work.id, home.id].join(),
    );
    socket.close();
    const added = await addImapAccount(app.api, token, mailbox(3), 'Nový');
    const listed = await app.api.ok(api.accounts.list, {}, token);
    expect(listed.map((account) => account.id)).toEqual([club.id, work.id, home.id, added.id]);
  });

  it('rejects an order that is not exactly the accounts of the user', async () => {
    const token = (await registerUser(app.api, uniqueEmail())).accessToken;
    const first = await addImapAccount(app.api, token, mailbox(0), 'Prvý');
    const second = await addImapAccount(app.api, token, mailbox(1), 'Druhý');
    const strangerToken = (await registerUser(app.api, uniqueEmail())).accessToken;
    const foreign = await addImapAccount(app.api, strangerToken, mailbox(2), 'Cudzí');
    const attempt = (accountIds: AccountId[]) =>
      app.api.fail(api.accounts.reorder, { body: { accountIds } }, token);

    const missing = await attempt([second.id]);
    const duplicate = await attempt([second.id, first.id, second.id]);
    const stranger = await attempt([second.id, first.id, foreign.id]);

    for (const failure of [missing, duplicate, stranger]) {
      expect(failure).toMatchObject({ status: 400, error: { code: 'validation_failed' } });
    }
    const listed = await app.api.ok(api.accounts.list, {}, token);
    expect(listed.map((account) => account.id)).toEqual([first.id, second.id]);
    const strangers = await app.api.ok(api.accounts.list, {}, strangerToken);
    expect(strangers.map((account) => account.id)).toEqual([foreign.id]);
  });
});
