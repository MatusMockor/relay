import type { Mailbox, Message, MessagePlacement, ThreadAction } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present } from '../support/fixtures';
import { GMAIL_FIRST, seedGmailAccount } from '../support/gmail-move-setup';
import { gmailInboxAndAllMail } from '../support/placements';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const placementsOf = (engine: TestEngine, message: Message): MessagePlacement[] =>
  [...present(engine.db.tables.messages.get(message.id)).placements].sort((a, b) =>
    a.mailboxId.localeCompare(b.mailboxId),
  );

const at = (mailbox: Mailbox, uid: number): MessagePlacement => ({ mailboxId: mailbox.id, uid });

const sorted = (...placements: MessagePlacement[]) =>
  placements.sort((a, b) => a.mailboxId.localeCompare(b.mailboxId));

const uidsIn = (server: FakeMailServer, path: string): number[] => [
  ...server.mailbox(path).messages.keys(),
];

const gmailSetup = async (engine: TestEngine) => {
  const setup = await gmailInboxAndAllMail(engine);
  const { mailboxes } = engine.repositories;
  const trash = present(await mailboxes.findByPath(setup.account.id, 'Trash'));
  const spam = present(await mailboxes.findByPath(setup.account.id, 'Spam'));
  const sync = () => engine.services.sync.syncAccount(USER_ID, setup.account.id);
  const stateOf = () => present(engine.db.tables.threads.get(setup.thread.id)).state;
  const run = (action: ThreadAction) => setup.act(action);
  return { ...setup, trash, spam, sync, stateOf, run };
};

describe('Gmail actions on placements', () => {
  it('keeps the All Mail placement on archive and adds INBOX back on undone', async () => {
    const engine = createTestEngine();
    const { server, message, inbox, allMail, run } = await gmailSetup(engine);

    await run({ type: 'done' });
    expect(placementsOf(engine, message)).toEqual([at(allMail, 1)]);
    expect(uidsIn(server, 'INBOX')).toEqual([]);

    await run({ type: 'undone' });

    expect(placementsOf(engine, message)).toEqual(sorted(at(inbox, 2), at(allMail, 1)));
    expect(uidsIn(server, 'INBOX')).toEqual([2]);
    expect(uidsIn(server, 'Archive')).toEqual([1]);
  });

  it('keeps the known All Mail UID when the archive move reports no COPYUID', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedGmailAccount(engine, { uidplus: false });
    deliverMail(server, 'INBOX', GMAIL_FIRST);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const [message] = [...engine.db.tables.messages.values()];
    const allMail = present(await engine.repositories.mailboxes.findByPath(account.id, 'Archive'));

    await engine.services.actions.apply(USER_ID, present(message).threadId, { type: 'done' });

    expect(placementsOf(engine, present(message))).toEqual([at(allMail, 1)]);
    expect(uidsIn(server, 'INBOX')).toEqual([]);
  });

  it('archives a label move and labels the message on the server', async () => {
    const engine = createTestEngine();
    const { server, message, label, target, allMail, run } = await gmailSetup(engine);

    const moved = await run({ type: 'move', mailboxId: target.id });

    expect(moved.state).toBe('done');
    expect(placementsOf(engine, message)).toEqual([at(allMail, 1)]);
    expect(present(engine.db.tables.messages.get(message.id)).labelIds).toEqual([label.id]);
    expect(uidsIn(server, 'INBOX')).toEqual([]);
    expect(uidsIn(server, 'Klienti')).toEqual([1]);
  });

  it('keeps All Mail after trash until the next sync confirms Gmail removed it', async () => {
    const engine = createTestEngine();
    const { server, message, allMail, trash, run, sync, stateOf } = await gmailSetup(engine);

    await run({ type: 'trash' });

    expect(placementsOf(engine, message)).toEqual(sorted(at(allMail, 1), at(trash, 1)));
    expect(stateOf()).toBe('trash');
    expect([uidsIn(server, 'INBOX'), uidsIn(server, 'Archive'), uidsIn(server, 'Trash')]).toEqual([
      [],
      [],
      [1],
    ]);
    await sync();
    expect(placementsOf(engine, message)).toEqual([at(trash, 1)]);
    expect(stateOf()).toBe('trash');
  });

  it('restores a trashed message to INBOX and attaches the returning All Mail copy', async () => {
    const engine = createTestEngine();
    const { server, message, inbox, allMail, run, sync, stateOf } = await gmailSetup(engine);
    await run({ type: 'trash' });
    await sync();

    await run({ type: 'restore' });
    expect(placementsOf(engine, message)).toEqual([at(inbox, 2)]);
    await sync();

    expect(placementsOf(engine, message)).toEqual(sorted(at(inbox, 2), at(allMail, 2)));
    expect([...engine.db.tables.messages.keys()]).toEqual([message.id]);
    expect(stateOf()).toBe('inbox');
    expect([uidsIn(server, 'INBOX'), uidsIn(server, 'Archive'), uidsIn(server, 'Trash')]).toEqual([
      [2],
      [2],
      [],
    ]);
  });

  it('turns the reported placement into Spam and drops All Mail after the next sync', async () => {
    const engine = createTestEngine();
    const { server, message, allMail, spam, run, sync, stateOf } = await gmailSetup(engine);

    await run({ type: 'reportSpam' });

    expect(placementsOf(engine, message)).toEqual(sorted(at(allMail, 1), at(spam, 1)));
    expect(stateOf()).toBe('spam');
    await sync();
    expect(placementsOf(engine, message)).toEqual([at(spam, 1)]);
    expect(stateOf()).toBe('spam');
    expect(uidsIn(server, 'Archive')).toEqual([]);
  });
});
