import type { GreenMailUser } from '@relay/config/test-infra';
import { type EventPublisher, PORT_TOKENS } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImapIdleManager } from '../../src/jobs/idle/imap-idle-manager';
import { registerUser } from '../support/auth-flow';
import {
  createGreenMailUser,
  deleteGreenMailUser,
  listSubjects,
  openImap,
  rawMail,
} from '../support/greenmail';
import { addImapAccount, listInbox, waitForInbox } from '../support/mail-flow';
import { authenticateRealtime } from '../support/realtime-client';
import { startTestApp, type TestApp } from '../support/test-app';

const HOUR = 60 * 60_000;

describe('mail flow against GreenMail', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let second: GreenMailUser;
  let partner: GreenMailUser;
  let ownerImap: ImapFlow;
  let partnerImap: ImapFlow;

  beforeAll(async () => {
    owner = await createGreenMailUser('owner');
    second = await createGreenMailUser('second');
    partner = await createGreenMailUser('partner');
    ownerImap = await openImap(owner);
    partnerImap = await openImap(partner);
    await ownerImap.mailboxCreate('Archive');
    await ownerImap.mailboxCreate('Sent');
    await ownerImap.append(
      'INBOX',
      rawMail({ from: partner.email, to: owner.email, subject: 'Project kickoff', body: 'Hi!' }),
    );
    await ownerImap.append(
      'INBOX',
      rawMail({ from: partner.email, to: owner.email, subject: 'Invoice 42', body: 'Pay me' }),
    );
    const secondImap = await openImap(second);
    await secondImap.append(
      'INBOX',
      rawMail({ from: partner.email, to: second.email, subject: 'Private note', body: 'Hey' }),
    );
    await secondImap.logout();
    app = await startTestApp({ env: { JOBS_ENABLED: 'true', IMAP_IDLE_ENABLED: 'true' } });
  });

  afterAll(async () => {
    await app.close();
    await ownerImap.logout();
    await partnerImap.logout();
    await Promise.all([owner, second, partner].map((user) => deleteGreenMailUser(user)));
  });

  it('syncs accounts, acts on threads, sends replies and fires timed work', async () => {
    const session = await registerUser(app.api, `mail-${owner.email}`);
    let token = session.accessToken;
    let refreshToken = session.refreshToken;
    const travel = async (ms: number): Promise<void> => {
      app.clock.advance(ms);
      const pair = await app.api.ok(api.auth.refresh, { body: { refreshToken } });
      token = pair.accessToken;
      refreshToken = pair.refreshToken;
    };
    const socket = await authenticateRealtime(app.baseUrl, token);

    const work = await addImapAccount(app.api, token, owner, 'Work');
    expect(work).toMatchObject({ provider: 'imap', email: owner.email, displayName: 'Work' });
    const workThreads = await waitForInbox(app.api, token, (threads) => threads.length === 2);
    expect(workThreads.map((thread) => thread.subject).sort()).toEqual([
      'Invoice 42',
      'Project kickoff',
    ]);
    await socket.waitFor(
      (message) => message.type === 'event' && message.event.type === 'thread.upserted',
    );

    const personal = await addImapAccount(app.api, token, second, 'Personal');
    await waitForInbox(app.api, token, (threads) => threads.length === 3);
    const perAccount = await listInbox(app.api, token, personal.id);
    expect(perAccount.items.map((thread) => thread.subject)).toEqual(['Private note']);

    const idle = app.app.get(ImapIdleManager);
    await expect.poll(() => idle.watching(work.id), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => idle.watching(personal.id), { timeout: 10_000 }).toBe(true);
    await app.app.get<EventPublisher>(PORT_TOKENS.EventPublisher).publish(session.user.id, {
      type: 'account.upserted',
      at: app.clock.now().toISOString(),
      data: { account: { ...personal, status: 'disconnected' } },
    });
    await expect.poll(() => idle.watching(personal.id), { timeout: 10_000 }).toBe(false);
    await ownerImap.append(
      'INBOX',
      rawMail({ from: partner.email, to: owner.email, subject: 'Pushed by IDLE', body: 'Now' }),
    );
    await waitForInbox(app.api, token, (threads) =>
      threads.some((thread) => thread.subject === 'Pushed by IDLE'),
    );

    const mailboxes = await app.api.ok(api.accounts.mailboxes, { params: { id: work.id } }, token);
    expect(mailboxes.map((mailbox) => mailbox.role)).toEqual(
      expect.arrayContaining(['inbox', 'archive']),
    );

    const invoice = workThreads.find((thread) => thread.subject === 'Invoice 42');
    expect(invoice).toBeDefined();
    const invoiceId = invoice?.id ?? workThreads[0]?.id;
    expect(invoiceId).toBeDefined();
    if (invoiceId === undefined) {
      return;
    }
    const done = await app.api.ok(
      api.threads.action,
      { params: { id: invoiceId }, body: { type: 'done' } },
      token,
    );
    expect(done.state).toBe('done');
    await expect
      .poll(() => listSubjects(ownerImap, 'Archive'), { timeout: 10_000 })
      .toEqual(['Invoice 42']);
    expect((await listSubjects(ownerImap, 'INBOX')).sort()).toEqual([
      'Project kickoff',
      'Pushed by IDLE',
    ]);
    const doneView = await app.api.ok(api.threads.list, { query: { view: 'done' } }, token);
    expect(doneView.items.map((thread) => thread.id)).toEqual([invoiceId]);

    const kickoff = workThreads.find((thread) => thread.subject === 'Project kickoff');
    const kickoffId = kickoff?.id;
    expect(kickoffId).toBeDefined();
    if (kickoffId === undefined) {
      return;
    }
    const detail = await app.api.ok(api.threads.get, { params: { id: kickoffId } }, token);
    const original = detail.messages[0];
    expect(original?.subject).toBe('Project kickoff');
    const sent = await app.api.ok(
      api.compose.send,
      {
        body: {
          source: 'inline',
          draft: {
            accountId: work.id,
            to: [{ name: null, email: partner.email }],
            cc: [],
            bcc: [],
            subject: 'Re: Project kickoff',
            body: 'Sounds good.',
            inReplyToThreadId: kickoffId,
            inReplyToMessageId: original?.id ?? null,
          },
        },
      },
      token,
    );
    expect(sent.status).toBe('sent');
    await expect
      .poll(() => listSubjects(partnerImap, 'INBOX'), { timeout: 10_000 })
      .toContain('Re: Project kickoff');

    const remindAt = new Date(app.clock.now().getTime() + HOUR).toISOString();
    const snoozed = await app.api.ok(
      api.threads.action,
      { params: { id: kickoffId }, body: { type: 'remind', at: remindAt } },
      token,
    );
    expect(snoozed.state).toBe('reminder');
    await waitForInbox(
      app.api,
      token,
      (threads) => !threads.some((t) => t.id === kickoffId),
      work.id,
    );
    await travel(2 * HOUR);
    await waitForInbox(
      app.api,
      token,
      (threads) => threads.some((t) => t.id === kickoffId),
      work.id,
    );

    const scheduledAt = new Date(app.clock.now().getTime() + HOUR).toISOString();
    const scheduled = await app.api.ok(
      api.compose.send,
      {
        body: {
          source: 'inline',
          scheduledAt,
          draft: {
            accountId: work.id,
            to: [{ name: null, email: partner.email }],
            cc: [],
            bcc: [],
            subject: 'Scheduled hello',
            body: 'From the future.',
            inReplyToThreadId: null,
            inReplyToMessageId: null,
          },
        },
      },
      token,
    );
    expect(scheduled.status).toBe('scheduled');
    const pending = await app.api.ok(api.compose.listScheduled, {}, token);
    expect(pending.map((item) => item.scheduledAt)).toEqual([scheduledAt]);
    expect(await listSubjects(partnerImap, 'INBOX')).not.toContain('Scheduled hello');
    await travel(2 * HOUR);
    await expect
      .poll(() => listSubjects(partnerImap, 'INBOX'), { timeout: 15_000 })
      .toContain('Scheduled hello');
    await expect
      .poll(async () => (await app.api.ok(api.compose.listScheduled, {}, token)).length)
      .toBe(0);

    socket.close();
  }, 120_000);
});
