import type { MailboxId, ThreadAction } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';

const setup = async (engine: TestEngine, deliveries: readonly (readonly [string, MailSpec])[]) => {
  const { account, server } = await seedAccount(engine);
  server.addMailbox('Junk', 'spam');
  server.addMailbox('Faktúry', 'custom');
  deliveries.forEach(([path, spec]) => deliverMail(server, path, spec));
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const thread = present([...engine.db.tables.threads.values()][0]);
  const mailboxId = async (path: string): Promise<MailboxId> =>
    present(await engine.repositories.mailboxes.findByPath(account.id, path)).id;
  const act = (action: ThreadAction) => engine.services.actions.apply(USER_ID, thread.id, action);
  return { server, thread, mailboxId, act };
};

describe('undoing a move', () => {
  it('honors the new UID of a plain IMAP move when the folder already has a copy with the same email id', async () => {
    const engine = createTestEngine();
    const copy: MailSpec = { id: 'm1', emailId: 'obj-1', date: DATE };
    const { server, thread, mailboxId, act } = await setup(engine, [
      ['INBOX', copy],
      ['Faktúry', copy],
    ]);
    const folder = await mailboxId('Faktúry');

    await act({ type: 'move', mailboxId: folder });

    const rows = await engine.repositories.messages.listByThread(USER_ID, thread.id);
    expect(rows.map(({ mailboxId: id, uid }) => `${id}:${String(uid)}`).sort()).toEqual([
      `${folder}:1`,
      `${folder}:2`,
    ]);
    await act({ type: 'undoMove' });
    expect(server.mailbox('INBOX').messages.size).toBe(1);
    expect([...server.mailbox('Faktúry').messages.keys()]).toEqual([1]);
  });

  it.each([
    ['trash', 'restore', 'trash'],
    ['reportSpam', 'notSpam', 'spam'],
  ] as const)(
    'still returns folder mail to its folder on %s release after a move out and its undo',
    async (hold, release, state) => {
      const engine = createTestEngine();
      const { server, mailboxId, act } = await setup(engine, [
        ['Faktúry', { id: 'f1', date: DATE }],
      ]);
      await act({ type: hold });
      await act({ type: 'move', mailboxId: await mailboxId('Archive') });

      expect((await act({ type: 'undoMove' })).state).toBe(state);
      expect((await act({ type: release })).state).toBe('done');

      expect(server.mailbox('Faktúry').messages.size).toBe(1);
      expect(server.mailbox('INBOX').messages.size).toBe(0);
    },
  );

  it('keeps both the trash and the spam origin of a message through a move and its undo', async () => {
    const engine = createTestEngine();
    const { server, mailboxId, act } = await setup(engine, [['Faktúry', { id: 'f1', date: DATE }]]);
    await act({ type: 'reportSpam' });
    await act({ type: 'trash' });
    await act({ type: 'move', mailboxId: await mailboxId('Archive') });

    expect((await act({ type: 'undoMove' })).state).toBe('trash');
    expect((await act({ type: 'restore' })).state).toBe('spam');
    expect((await act({ type: 'notSpam' })).state).toBe('done');

    expect(server.mailbox('Faktúry').messages.size).toBe(1);
    expect(server.mailbox('INBOX').messages.size).toBe(0);
  });

  it('does nothing once the one-hour undo window is over', async () => {
    const engine = createTestEngine();
    const { server, mailboxId, act } = await setup(engine, [['INBOX', { id: 'm1', date: DATE }]]);
    await act({ type: 'move', mailboxId: await mailboxId('Faktúry') });
    engine.clock.advance(61 * 60_000);

    expect((await act({ type: 'undoMove' })).state).toBe('done');

    expect(server.mailbox('Faktúry').messages.size).toBe(1);
    expect(server.mailbox('INBOX').messages.size).toBe(0);
  });
});
