import { ThreadListQuerySchema } from '@relay/shared/api';
import { type Mailbox, type Message, type MessagePlacement } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import type { MailAccount } from '@relay/shared/domain';
import { deliverMail, type MailSpec, ME, present, seedAccount } from '../support/fixtures';
import { seedGmailAccount } from '../support/gmail-move-setup';
import { searchServer } from '../support/server-search';
import { answerAll } from '../support/thread-ai';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const SPEC: MailSpec = { id: 'g1', subject: 'Ponuka na web', date: '2026-11-14T08:00:00.000Z' };

const mailboxAt = async (engine: TestEngine, account: MailAccount, path: string) =>
  present(await engine.repositories.mailboxes.findByPath(account.id, path));

const stored = (engine: TestEngine): Message[] => [...engine.db.tables.messages.values()];

const onlyMessage = (engine: TestEngine): Message => {
  const messages = stored(engine);
  expect(messages).toHaveLength(1);
  return present(messages[0]);
};

const byMailbox = (placements: readonly MessagePlacement[]) =>
  [...placements].sort((a, b) => a.mailboxId.localeCompare(b.mailboxId));

const at = (mailbox: Mailbox, uid: number): MessagePlacement => ({ mailboxId: mailbox.id, uid });

const subjectsMatching = async (engine: TestEngine, q: string) =>
  (
    await engine.services.inbox.list(USER_ID, ThreadListQuerySchema.parse({ view: 'inbox', q }))
  ).items.map((thread) => [thread.subject, thread.messageCount]);

describe('placing synced Gmail copies on one message', () => {
  it('stores INBOX and All Mail as one message that every reader sees once', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedGmailAccount(engine);
    deliverMail(server, 'INBOX', SPEC);

    const report = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(report.newMessages).toBe(1);
    const message = onlyMessage(engine);
    const inbox = await mailboxAt(engine, account, 'INBOX');
    const allMail = await mailboxAt(engine, account, 'Archive');
    expect(byMailbox(message.placements)).toEqual(byMailbox([at(inbox, 1), at(allMail, 1)]));
    expect(message.emailId).toBe('gm-g1@mail.test');
    expect(await subjectsMatching(engine, 'Ponuka')).toEqual([['Ponuka na web', 1]]);
    const detail = await engine.services.threads.getDetail(USER_ID, message.threadId);
    expect(detail.messages.map(({ id }) => id)).toEqual([message.id]);
    const response = await searchServer(engine, 'Ponuka');
    expect(response.hits.map((hit) => hit.messageId)).toEqual([message.id]);
    answerAll(engine);
    const job = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'summary', threadId: message.threadId },
    });
    await engine.services.ai.runJob(USER_ID, job.id);
    expect(engine.claude.requests[0]?.thread?.messages.map(({ id }) => id)).toEqual([message.id]);
  });

  it('attaches a server search hit on an All Mail UID the message lost locally', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedGmailAccount(engine);
    deliverMail(server, 'INBOX', SPEC);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const message = onlyMessage(engine);
    const inbox = await mailboxAt(engine, account, 'INBOX');
    const allMail = await mailboxAt(engine, account, 'Archive');
    await engine.repositories.messages.removePlacement(message.id, allMail.id);
    expect(onlyMessage(engine).placements).toEqual([at(inbox, 1)]);

    const response = await searchServer(engine, 'Ponuka');

    expect(response.hits.map((hit) => hit.messageId)).toEqual([message.id]);
    const attached = onlyMessage(engine);
    expect(byMailbox(attached.placements)).toEqual(byMailbox([at(inbox, 1), at(allMail, 1)]));
    expect(attached.bodyState).toBeUndefined();
    expect(attached.textBody).toBe(message.textBody);
  });

  it('replaces the older INBOX UID when the web puts the message back before the diff', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedGmailAccount(engine);
    deliverMail(server, 'INBOX', SPEC);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const inbox = await mailboxAt(engine, account, 'INBOX');
    server.expunge('INBOX', 1);
    expect(deliverMail(server, 'INBOX', SPEC)).toBe(2);
    server.updateFlags('INBOX', 2, { seen: true });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const message = onlyMessage(engine);
    expect(message.placements).toContainEqual(at(inbox, 2));
    expect(message.placements).not.toContainEqual(at(inbox, 1));
    expect(message.flags.seen).toBe(true);
  });

  it('joins a recorded Sent copy of IMAP on Gmail with its All Mail copy after the next sync', async () => {
    const engine = createTestEngine();
    const { account } = await seedGmailAccount(engine);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const draft = await engine.services.compose.createDraft(USER_ID, {
      accountId: account.id,
      to: [{ name: 'Peter Kral', email: 'peter@partner.test' }],
      cc: [],
      bcc: [],
      subject: 'Podklady',
      body: 'Posielam podklady.',
      inReplyToThreadId: null,
      inReplyToMessageId: null,
      attachments: [],
    });
    await engine.services.compose.send(USER_ID, { source: 'draft', draftId: draft.id });
    expect(onlyMessage(engine).emailId).toBeNull();
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const message = onlyMessage(engine);
    const sent = await mailboxAt(engine, account, 'Sent');
    const allMail = await mailboxAt(engine, account, 'Archive');
    expect(message.emailId).not.toBeNull();
    expect(byMailbox(message.placements)).toEqual(byMailbox([at(sent, 1), at(allMail, 1)]));
  });

  it('keeps generic IMAP copies in two folders as two messages with their own flags', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', SPEC);
    deliverMail(server, 'Archive', SPEC);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const inbox = await mailboxAt(engine, account, 'INBOX');
    const copies = stored(engine);
    expect(copies).toHaveLength(2);
    const inboxCopy = present(copies.find((copy) => copy.mailboxId === inbox.id));

    server.updateFlags('INBOX', 1, { seen: true });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.record('Archive', 1).flags.seen).toBe(false);
    expect(
      stored(engine).map((copy) => [copy.id === inboxCopy.id, copy.flags.seen, copy.placements]),
    ).toEqual(
      expect.arrayContaining([
        [true, true, [at(inbox, 1)]],
        [false, false, [at(await mailboxAt(engine, account, 'Archive'), 1)]],
      ]),
    );
  });

  it('applies a Gmail flag change once and keeps it across both placements', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedGmailAccount(engine);
    deliverMail(server, 'INBOX', { ...SPEC, from: ME });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    server.updateFlags('Archive', 1, { flagged: true });

    await engine.services.sync.syncAccount(USER_ID, account.id);
    const flagged = onlyMessage(engine);
    await engine.services.actions.apply(USER_ID, flagged.threadId, { type: 'markRead' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(onlyMessage(engine).flags).toEqual({ seen: true, flagged: true, answered: false });
    expect(server.record('INBOX', 1).flags.seen).toBe(true);
    expect(server.record('Archive', 1).flags.seen).toBe(true);
    expect([...engine.db.tables.pendingWork.values()].map(({ kind }) => kind)).not.toContain(
      'provider-op',
    );
  });
});
