import type { Message, MessageId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  copyMergeRow,
  enqueueCopyMerge,
  expectMergeInvariants,
  storedMessages,
} from '../support/copy-merge';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { type LegacySpec, seedLegacyDuplicates } from '../support/legacy-duplicates';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const SPECS: readonly LegacySpec[] = [
  { id: 'r1', subject: 'Zmluva', date: '2026-11-14T08:00:00.000Z', unresolved: true },
  { id: 'r2', subject: 'Objednavka', date: '2026-11-14T09:00:00.000Z', unresolved: true },
];

const sortedIds = (ids: readonly string[]): string[] => [...ids].sort();

const stored = (engine: TestEngine, id: MessageId): Message | undefined =>
  engine.db.tables.messages.get(id);

const onEmailIdFetch = (server: FakeMailServer, path: string, effect: () => void): void => {
  server.beforeNextFetch = () => {
    if (server.emailIdFetches.at(-1)?.path !== path) {
      onEmailIdFetch(server, path, effect);
      return;
    }
    effect();
  };
};

describe('CopyMergeBackfill email id resolution', () => {
  it('resolves null email ids per mailbox with the stored UIDVALIDITY before merging', async () => {
    const engine = createTestEngine();
    const { account, server, inbox, allMail, pairs } = await seedLegacyDuplicates(engine, SPECS);
    await enqueueCopyMerge(engine, account.id);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const states = await engine.repositories.syncStates.listByAccount(account.id);
    const validity = (mailboxId: string) =>
      present(states.find((state) => state.mailboxId === mailboxId)).uidValidity;
    expect(server.emailIdFetches).toEqual([
      { path: 'INBOX', uidValidity: validity(inbox.id), uids: [1, 2] },
      {
        path: 'Archive',
        uidValidity: validity(allMail.id),
        uids: pairs.map((pair) => pair.allMailUid),
      },
    ]);
    expect(
      sortedIds(storedMessages(engine).map((message) => `${message.id}=${message.emailId}`)),
    ).toEqual(
      sortedIds(
        pairs.map((pair, index) => `${pair.keeperId}=gm-${present(SPECS[index]).id}@mail.test`),
      ),
    );
    expectMergeInvariants(engine);
  });

  it('waits for a mailbox whose UIDVALIDITY changed until sync reconciled it', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { account, server, inbox, pairs } = await seedLegacyDuplicates(engine, SPECS);
    await enqueueCopyMerge(engine, account.id);
    onEmailIdFetch(server, 'INBOX', () => {
      server.mailbox('INBOX').uidValidity += 1;
    });
    const before = sortedIds(storedMessages(engine).map((message) => message.id));

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(sortedIds(storedMessages(engine).map((message) => message.id))).toEqual(before);
    expect(storedMessages(engine).every((message) => message.emailId === null)).toBe(true);
    expect(present(await copyMergeRow(engine, account.id)).payload.resolve?.[0]).toEqual({
      mailboxId: inbox.id,
      afterUid: 0,
    });
    expect(engine.logger.entries.map((entry) => entry.message)).toContain(
      'Copy merge waits for a mailbox with a new UIDVALIDITY',
    );

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const merged = storedMessages(engine);
    expect(merged).toHaveLength(pairs.length);
    merged.forEach((message) => {
      expect(message.placements).toHaveLength(2);
    });
    for (const { loserId } of pairs) {
      const resolved = await engine.repositories.messages.findById(USER_ID, loserId);
      expect(merged.map((message) => message.id)).toContain(present(resolved).id);
      expect(present(resolved).mailboxId).toBe(inbox.id);
    }
    expect(engine.db.tables.messageAliases.size).toBe(pairs.length);
    expectMergeInvariants(engine);
  });

  it('leaves rows alone whose UID the server no longer has', async () => {
    const engine = createTestEngine();
    const { account, server, pairs } = await seedLegacyDuplicates(engine, SPECS);
    const [gone, kept] = pairs.map(present);
    await enqueueCopyMerge(engine, account.id);
    onEmailIdFetch(server, 'Archive', () => {
      server.mailbox('Archive').messages.delete(present(gone).allMailUid);
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(present(stored(engine, present(gone).loserId)).emailId).toBeNull();
    expect(stored(engine, present(kept).loserId)).toBeUndefined();
    expect(storedMessages(engine)).toHaveLength(3);
    expectMergeInvariants(engine);
  });

  it('drops the work row of a generic IMAP account without asking the server', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'g1' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    await enqueueCopyMerge(engine, account.id);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await copyMergeRow(engine, account.id)).toBeNull();
    expect(server.emailIdFetches).toEqual([]);
  });
});
