import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { type PendingWorkRepository, PORT_TOKENS } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { AccountId, MessageId, ThreadId } from '@relay/shared/domain';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';
import { inviteIcs } from './support/invite-mail';

const ZONE = 'Europe/Bratislava';
const DAY = { from: '2026-11-16T00:00:00+01:00', to: '2026-11-17T00:00:00+01:00', timeZone: ZONE };
const FAILED_AT = '2026-11-15T20:00:00.000Z';

const plainMail = (from: string, to: string, subject: string): string =>
  [
    `From: Peter Kral <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Date: Sun, 15 Nov 2026 09:00:00 +0000',
    `Message-ID: <${randomUUID()}@partner.test>`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Pozvánka je v prílohe.',
    '',
  ].join('\r\n');

describe('failed calendar invitations over the server (Postgres)', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let imap: ImapFlow;

  beforeAll(async () => {
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
    owner = await createGreenMailUser('failed');
    imap = await openImap(owner);
  });

  afterAll(async () => {
    await imap.logout();
    await app.close();
    await deleteGreenMailUser(owner);
  });

  const pendingWork = () =>
    app.app.get<symbol, PendingWorkRepository>(PORT_TOKENS.PendingWorkRepository);

  const seedFailed = (
    accountId: AccountId,
    messageId: MessageId,
    threadId: ThreadId,
    uid: string,
  ) =>
    pendingWork().put({
      accountId,
      kind: 'calendar-invite',
      ref: messageId,
      createdAt: '2026-11-15T09:00:00.000Z',
      payload: {
        messageId,
        threadId,
        mailboxRole: 'inbox',
        parts: [
          inviteIcs({
            uid,
            organizer: 'peter@partner.test',
            attendee: owner.email,
            summary: 'Retro',
          }),
        ],
        publish: true,
        attempts: 6,
        nextAttemptAt: null,
        failedAt: FAILED_AT,
        lastError: 'deadlock detected',
      },
    });

  it('lists, retries and dismisses failed invitations of the signed-in user only', async () => {
    const session = await registerUser(app.api, `failed-${randomUUID().slice(0, 8)}@relay.test`);
    const token = session.accessToken;
    const other = await registerUser(app.api, `other-${randomUUID().slice(0, 8)}@relay.test`);
    await imap.append('INBOX', plainMail('peter@partner.test', owner.email, 'Pozvánka: Retro'));
    const account = await addImapAccount(app.api, token, owner);
    const [thread] = await waitForInbox(app.api, token, (threads) => threads.length === 1);
    const detail = await app.api.ok(api.threads.get, { params: { id: thread?.id ?? '' } }, token);
    const [message] = detail.messages;
    const threadId = detail.thread.id;
    const messageId = message?.id ?? ('' as MessageId);
    const ref = { accountId: account.id, messageId };
    const uid = `${randomUUID()}@partner.test`;
    await seedFailed(account.id, messageId, threadId, uid);

    expect(await app.api.ok(api.calendar.listFailedInvitations, {}, token)).toEqual([
      {
        accountId: account.id,
        accountEmail: owner.email,
        messageId,
        threadId: threadId,
        subject: 'Pozvánka: Retro',
        from: { name: 'Peter Kral', email: 'peter@partner.test' },
        date: '2026-11-15T09:00:00.000Z',
        attempts: 6,
        failedAt: FAILED_AT,
        lastError: 'deadlock detected',
      },
    ]);
    expect(await app.api.ok(api.calendar.listFailedInvitations, {}, other.accessToken)).toEqual([]);
    const foreign = await app.api.fail(
      api.calendar.retryFailedInvitation,
      { params: ref },
      other.accessToken,
    );
    expect(foreign.status).toBe(404);
    expect((await app.api.ok(api.calendar.occurrences, { query: DAY }, token)).items).toEqual([]);

    expect(await app.api.ok(api.calendar.retryFailedInvitation, { params: ref }, token)).toEqual({
      applied: true,
    });
    expect((await app.api.ok(api.calendar.occurrences, { query: DAY }, token)).items).toEqual([
      expect.objectContaining({ uid, title: 'Retro', threadId: threadId }),
    ]);
    expect(await app.api.ok(api.calendar.listFailedInvitations, {}, token)).toEqual([]);
    const gone = await app.api.fail(api.calendar.dismissFailedInvitation, { params: ref }, token);
    expect(gone.status).toBe(404);

    await seedFailed(account.id, messageId, threadId, uid);
    expect(await app.api.ok(api.calendar.dismissFailedInvitation, { params: ref }, token)).toEqual({
      ok: true,
    });
    expect(await app.api.ok(api.calendar.listFailedInvitations, {}, token)).toEqual([]);
    expect(await pendingWork().list(account.id, 'calendar-invite')).toEqual([]);
  });
});
