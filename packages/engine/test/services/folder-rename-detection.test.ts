import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { renameFakeMailbox } from '../support/mail/fake-folders';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';

const renamedSetup = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  seeded.server.addMailbox('Projekty', 'custom', 7001);
  seeded.server.addMailbox('Projekty/Alfa', 'custom', 7002);
  deliverMail(seeded.server, 'Projekty/Alfa', { id: 'a1', date: DATE });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  return seeded;
};

const messageIds = (engine: TestEngine) => [...engine.db.tables.messages.keys()].sort();

describe('remote folder renames', () => {
  it('keeps the mailbox id, its messages and its sync state when a folder tree is renamed', async () => {
    const engine = createTestEngine();
    const { account, server } = await renamedSetup(engine);
    const before = present(
      await engine.repositories.mailboxes.findByPath(account.id, 'Projekty/Alfa'),
    );
    const messages = messageIds(engine);
    const state = present(await engine.repositories.syncStates.find(before.id));
    engine.events.clear();

    renameFakeMailbox(server, 'Projekty', 'Klienti');
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const after = present(
      await engine.repositories.mailboxes.findByPath(account.id, 'Klienti/Alfa'),
    );
    expect(after.id).toBe(before.id);
    expect(after.name).toBe('Alfa');
    expect(messageIds(engine)).toEqual(messages);
    expect((await engine.repositories.syncStates.find(after.id))?.uidValidity).toBe(
      state.uidValidity,
    );
    expect(server.streamedMessages.filter(({ path }) => path === 'Klienti/Alfa')).toEqual([]);
    expect(await engine.repositories.mailboxes.findByPath(account.id, 'Projekty')).toBeNull();
    const updates = engine.events.ofType('mailboxes.updated');
    expect(updates.at(-1)?.data.mailboxes.map((mailbox) => mailbox.path)).toContain('Klienti/Alfa');
  });

  it('forgets and downloads again when the match is ambiguous', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    server.addMailbox('A', 'custom', 9000);
    server.addMailbox('B', 'custom', 9000);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const before = present(await engine.repositories.mailboxes.findByPath(account.id, 'A'));

    renameFakeMailbox(server, 'A', 'C');
    renameFakeMailbox(server, 'B', 'D');
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const after = present(await engine.repositories.mailboxes.findByPath(account.id, 'C'));
    expect(after.id).not.toBe(before.id);
    expect(await engine.repositories.mailboxes.findById(before.id)).toBeNull();
  });

  it('does not treat a folder with a different message count as renamed', async () => {
    const engine = createTestEngine();
    const { account, server } = await renamedSetup(engine);
    const before = present(
      await engine.repositories.mailboxes.findByPath(account.id, 'Projekty/Alfa'),
    );

    renameFakeMailbox(server, 'Projekty/Alfa', 'Projekty/Beta');
    deliverMail(server, 'Projekty/Beta', { id: 'b1', date: DATE });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const beta = present(
      await engine.repositories.mailboxes.findByPath(account.id, 'Projekty/Beta'),
    );
    expect(beta.id).not.toBe(before.id);
    expect(engine.db.tables.messages.size).toBe(2);
  });
});
