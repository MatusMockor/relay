import type { Mailbox, Message } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, present } from '../support/fixtures';
import { seedGmailAccount } from '../support/gmail-move-setup';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const SPEC: MailSpec = { id: 'g1', subject: 'Ponuka', date: '2026-11-14T08:00:00.000Z' };

const stored = (engine: TestEngine): Message[] => [...engine.db.tables.messages.values()];

const onlyMessage = (engine: TestEngine): Message => {
  const messages = stored(engine);
  expect(messages).toHaveLength(1);
  return present(messages[0]);
};

const mailboxIdsOf = (message: Message) =>
  message.placements.map(({ mailboxId }) => mailboxId).sort();

const syncedGmail = async (engine: TestEngine) => {
  const seeded = await seedGmailAccount(engine);
  seeded.server.addMailbox('Klienti', 'label', 501);
  deliverMail(seeded.server, 'INBOX', SPEC);
  const sync = () => engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  await sync();
  const mailbox = async (path: string): Promise<Mailbox> =>
    present(await engine.repositories.mailboxes.findByPath(seeded.account.id, path));
  return {
    ...seeded,
    sync,
    inbox: await mailbox('INBOX'),
    allMail: await mailbox('Archive'),
    label: await mailbox('Klienti'),
  };
};

const placeInLabel = async (engine: TestEngine, message: Message, from: Mailbox, to: Mailbox) => {
  await engine.repositories.messages.movePlacement(message.id, {
    from: from.id,
    to: { mailboxId: to.id, uid: 7 },
    keepSource: true,
  });
  expect(onlyMessage(engine).placements).toHaveLength(3);
};

describe('expunging and forgetting Gmail placements', () => {
  it('keeps the message through All Mail when INBOX is expunged and deletes it with the last copy', async () => {
    const engine = createTestEngine();
    const { server, sync, allMail } = await syncedGmail(engine);
    const { id, threadId } = onlyMessage(engine);

    server.expunge('INBOX', 1);
    await sync();

    expect(onlyMessage(engine)).toMatchObject({
      id,
      placements: [{ mailboxId: allMail.id, uid: 1 }],
    });
    expect(present(engine.db.tables.threads.get(threadId)).state).toBe('done');
    server.expunge('Archive', 1);
    await sync();
    expect(stored(engine)).toEqual([]);
    expect(engine.db.tables.threads.has(threadId)).toBe(false);
  });

  it('drops the INBOX placement on a UIDVALIDITY reset and attaches the refetched copy', async () => {
    const engine = createTestEngine();
    const { server, sync, inbox, allMail } = await syncedGmail(engine);
    const { id, threadId } = onlyMessage(engine);
    server.resetUidValidity('INBOX');
    server.mailbox('INBOX').uidNext = 5;
    server.expunge('INBOX', 1);
    expect(deliverMail(server, 'INBOX', SPEC)).toBe(5);

    await sync();

    const message = onlyMessage(engine);
    expect(message.id).toBe(id);
    expect(message.placements).toEqual(
      expect.arrayContaining([
        { mailboxId: inbox.id, uid: 5 },
        { mailboxId: allMail.id, uid: 1 },
      ]),
    );
    expect(present(engine.db.tables.threads.get(threadId)).state).toBe('inbox');
  });

  it('forgets the placements of a vanished label mailbox and keeps the message', async () => {
    const engine = createTestEngine();
    const { server, sync, inbox, allMail, label } = await syncedGmail(engine);
    await placeInLabel(engine, onlyMessage(engine), allMail, label);

    server.removeMailbox('Klienti');
    await sync();

    expect(engine.db.tables.mailboxes.has(label.id)).toBe(false);
    expect(mailboxIdsOf(onlyMessage(engine))).toEqual([inbox.id, allMail.id].sort());
  });

  it('forgets the label mailbox placements when the Gmail label is deleted', async () => {
    const engine = createTestEngine();
    const { inbox, allMail, label } = await syncedGmail(engine);
    await placeInLabel(engine, onlyMessage(engine), allMail, label);

    await engine.services.folders.remove(USER_ID, label.id);

    expect(engine.db.tables.mailboxes.has(label.id)).toBe(false);
    expect(mailboxIdsOf(onlyMessage(engine))).toEqual([inbox.id, allMail.id].sort());
  });
});
