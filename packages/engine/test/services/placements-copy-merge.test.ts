import type { Mailbox, Message, MessageId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, present } from '../support/fixtures';
import { seedGmailAccount } from '../support/gmail-move-setup';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const SPEC: MailSpec = { id: 'g1', subject: 'Ponuka', date: '2026-11-14T08:00:00.000Z' };
const LEGACY_ID = 'msg_legacy_all_mail' as MessageId;

const legacyDuplicates = async (engine: TestEngine) => {
  const { account, server } = await seedGmailAccount(engine);
  server.addMailbox('Klienti', 'label', 501);
  deliverMail(server, 'INBOX', { ...SPEC, allMail: false });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const { mailboxes, messages } = engine.repositories;
  const mailbox = async (path: string): Promise<Mailbox> =>
    present(await mailboxes.findByPath(account.id, path));
  const inbox = await mailbox('INBOX');
  const allMail = await mailbox('Archive');
  const [moving] = [...engine.db.tables.messages.values()];
  const allMailUid = deliverMail(server, 'Archive', SPEC);
  const location = { mailboxId: allMail.id, uid: allMailUid };
  const legacy = await messages.upsert(
    { ...present(moving), id: LEGACY_ID, ...location, placements: [location] },
    new Map(),
  );
  const draft = await engine.services.compose.createDraft(USER_ID, {
    accountId: account.id,
    to: [{ name: 'Peter Kral', email: 'peter@partner.test' }],
    cc: [],
    bcc: [],
    subject: 'Re: Ponuka',
    body: 'Ďakujem',
    inReplyToThreadId: present(moving).threadId,
    inReplyToMessageId: present(moving).id,
    attachments: [],
  });
  const target = await mailbox('Klienti');
  const sent = await mailbox('Sent');
  return { account, moving: present(moving), legacy, draft, inbox, sent, target };
};

const moveOrigins = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()]
    .filter((work) => work.kind === 'move-origin')
    .map(({ ref }) => ref)
    .sort();

const stored = (engine: TestEngine, message: Message) => engine.db.tables.messages.get(message.id);

describe('merging a moved copy into a legacy duplicate', () => {
  it('moves origins and reply drafts to the twin when the moving message is retired', async () => {
    const engine = createTestEngine();
    const { moving, legacy, draft, target } = await legacyDuplicates(engine);

    await engine.services.actions.apply(USER_ID, moving.threadId, {
      type: 'move',
      mailboxId: target.id,
    });

    expect(stored(engine, moving)).toBeUndefined();
    expect(moveOrigins(engine)).toEqual([legacy.id]);
    expect((await engine.services.compose.getDraft(USER_ID, draft.id)).inReplyToMessageId).toBe(
      legacy.id,
    );
  });

  it('keeps origins and reply drafts on the moving message when it survives elsewhere', async () => {
    const engine = createTestEngine();
    const { moving, legacy, draft, inbox, sent, target } = await legacyDuplicates(engine);
    await engine.repositories.messages.movePlacement(moving.id, {
      from: inbox.id,
      to: { mailboxId: sent.id, uid: 9 },
      keepSource: true,
    });

    await engine.services.actions.apply(USER_ID, moving.threadId, {
      type: 'move',
      mailboxId: target.id,
    });

    expect(present(stored(engine, moving)).placements).toEqual([{ mailboxId: sent.id, uid: 9 }]);
    expect(moveOrigins(engine).sort()).toEqual([moving.id, legacy.id].sort());
    expect((await engine.services.compose.getDraft(USER_ID, draft.id)).inReplyToMessageId).toBe(
      moving.id,
    );
  });
});
