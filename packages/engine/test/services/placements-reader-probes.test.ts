import type { MailAccount, Message, MessageId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import type { PendingWorkInput } from '../../src/model/pending-work';
import { MoveTargetProbe } from '../../src/services/automations/history/move-target-probe';
import { HeldInviteRelease } from '../../src/services/calendar/held-invite-release';
import { InviteQueue } from '../../src/services/calendar/invite-queue';
import { ManualClock } from '../support/fakes/infrastructure';
import { deliverMail, messageHeader, present } from '../support/fixtures';
import { GMAIL_FIRST } from '../support/gmail-move-setup';
import { storedMessages } from '../support/history';
import { gmailInboxAndAllMail } from '../support/placements';
import { createTestEngine, TEST_NOW, type TestEngine, USER_ID } from '../support/test-engine';

const heldInvite = (
  account: MailAccount,
  message: Message,
  createdAt: string,
): PendingWorkInput<'calendar-invite'> => ({
  accountId: account.id,
  kind: 'calendar-invite',
  ref: message.id,
  payload: {
    messageId: message.id,
    threadId: message.threadId,
    mailboxRole: 'inbox',
    parts: ['BEGIN:VCALENDAR'],
    publish: true,
    attempts: 0,
    nextAttemptAt: null,
    failedAt: null,
    lastError: null,
    held: true,
  },
  createdAt,
});

const releasedOrder = async (engine: TestEngine, account: MailAccount): Promise<MessageId[]> => {
  const work = await engine.repositories.pendingWork.list(account.id, 'calendar-invite');
  expect(work.every((item) => item.payload.held === undefined)).toBe(true);
  return [...work]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((item) => item.payload.messageId);
};

const probeOf = (engine: TestEngine): MoveTargetProbe =>
  new MoveTargetProbe(
    engine.repositories.mailboxes,
    engine.repositories.labels,
    engine.repositories.messages,
  );

describe('placement probes', () => {
  it('releases held invites in the order of their best placement', async () => {
    const engine = createTestEngine();
    const { account, server, message, allMail, inbox } = await gmailInboxAndAllMail(engine);
    deliverMail(server, 'Archive', { id: 'g2', emailId: 'gm-2', date: GMAIL_FIRST.date });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const archived = present(
      storedMessages(engine).find((stored) => stored.messageIdHeader === messageHeader('g2')),
    );
    await engine.repositories.pendingWork.put(heldInvite(account, archived, TEST_NOW));
    await engine.repositories.pendingWork.put(heldInvite(account, message, TEST_NOW));
    const release = new HeldInviteRelease({
      pendingWork: engine.repositories.pendingWork,
      messages: engine.repositories.messages,
      queue: new InviteQueue(new ManualClock(TEST_NOW)),
    });

    await release.release(USER_ID, account, [allMail.id, inbox.id]);

    expect(await releasedOrder(engine, account)).toEqual([message.id, archived.id]);
  });

  it('locates a move target through a placement that is not the primary one', async () => {
    const engine = createTestEngine();
    const { thread, message, allMail } = await gmailInboxAndAllMail(engine);
    const probe = probeOf(engine);

    expect(message.mailboxId).not.toBe(allMail.id);
    await expect(probe.locate(USER_ID, thread, allMail.id)).resolves.toEqual({
      role: 'archive',
      labelId: null,
    });
    await expect(
      probe.recordedIn(USER_ID, thread, [message.id], ['archive', 'inbox']),
    ).resolves.toEqual([message.id]);
    await expect(probe.recordedIn(USER_ID, thread, [message.id], ['trash'])).resolves.toEqual([]);
  });

  it('adopts a pending sent placement of a message whose primary is elsewhere', async () => {
    const engine = createTestEngine();
    const { account, server, message } = await gmailInboxAndAllMail(engine);
    const sent = present(await engine.repositories.mailboxes.findByPath(account.id, 'Sent'));
    const stored = present(engine.db.tables.messages.get(message.id));
    engine.db.tables.messages.set(message.id, {
      ...stored,
      placements: [...stored.placements, { mailboxId: sent.id, uid: 0 }],
    });
    const sentUid = deliverMail(server, 'Sent', GMAIL_FIRST);
    const before = storedMessages(engine).map(({ id }) => id);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(storedMessages(engine).map(({ id }) => id)).toEqual(before);
    const adopted = present(engine.db.tables.messages.get(message.id));
    expect(adopted.placements).toContainEqual({ mailboxId: sent.id, uid: sentUid });
  });
});
