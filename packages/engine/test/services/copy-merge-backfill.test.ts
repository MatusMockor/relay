import type { Message } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  copyMergeRow,
  enqueueCopyMerge,
  expectMergeInvariants,
  messagesWithEmailId,
  pendingOfKind,
  storedMessages,
} from '../support/copy-merge';
import {
  ACTIVITY,
  DONE_JOB,
  EVENT,
  KEEPER_JOB,
  LOSER_JOB,
  LOSER_RULE,
  RESULT,
  RULE,
  seedLoserReferences,
} from '../support/copy-merge-references';
import { present } from '../support/fixtures';
import { type LegacySpec, seedLegacyDuplicates } from '../support/legacy-duplicates';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const SPECS: readonly LegacySpec[] = [
  { id: 'm1', subject: 'Ponuka', date: '2026-11-14T08:00:00.000Z' },
  { id: 'm2', subject: 'Faktura', date: '2026-11-14T09:00:00.000Z', unresolved: true },
];

const stored = (engine: TestEngine, id: Message['id']): Message =>
  present(engine.db.tables.messages.get(id));

const legacySetup = async (engine: TestEngine) => {
  const seeded = await seedLegacyDuplicates(engine, SPECS);
  const [first, second] = seeded.pairs;
  const pair = present(first);
  const keeper = stored(engine, pair.keeperId);
  const loser = stored(engine, pair.loserId);
  await engine.repositories.messages.updateFlags(keeper.id, { ...keeper.flags, seen: true });
  const references = await seedLoserReferences(engine, seeded.account, keeper, loser);
  seeded.server.failFlagWrites = 'offline';
  await enqueueCopyMerge(engine, seeded.account.id);
  return { ...seeded, pair, unresolved: present(second), keeper, loser, ...references };
};

describe('CopyMergeBackfill', () => {
  it('merges legacy duplicates into one message per email id', async () => {
    const engine = createTestEngine();
    const { account, server, inbox, allMail, pair, unresolved, keeper } = await legacySetup(engine);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(
      storedMessages(engine)
        .map((message) => message.id)
        .sort(),
    ).toEqual([pair.keeperId, unresolved.keeperId].sort());
    expect(messagesWithEmailId(engine, present(keeper.emailId))).toHaveLength(1);
    expect(present(stored(engine, unresolved.keeperId).emailId)).toBe('gm-m2@mail.test');
    for (const { keeperId, allMailUid } of [pair, unresolved]) {
      expect([...stored(engine, keeperId).placements].sort((a, b) => a.uid - b.uid)).toEqual(
        [
          { mailboxId: inbox.id, uid: stored(engine, keeperId).uid },
          { mailboxId: allMail.id, uid: allMailUid },
        ].sort((a, b) => a.uid - b.uid),
      );
      expect(stored(engine, keeperId).mailboxId).toBe(inbox.id);
    }
    expect(server.emailIdFetches.map(({ path, uidValidity }) => [path, uidValidity])).toEqual([
      ['INBOX', server.mailbox('INBOX').uidValidity],
      ['Archive', server.mailbox('Archive').uidValidity],
    ]);
    expect((await engine.repositories.messages.findById(USER_ID, pair.loserId))?.id).toBe(
      pair.keeperId,
    );
    expectMergeInvariants(engine);
  });

  it('shows each merged message once in thread detail, counts, search and AI', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { account, keeper } = await legacySetup(engine);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const detail = await engine.services.threads.getDetail(USER_ID, keeper.threadId);
    expect(detail.messages.map((message) => message.id)).toEqual([keeper.id]);
    expect(present(engine.db.tables.threads.get(keeper.threadId)).messageCount).toBe(1);
    const found = await engine.services.inbox.list(USER_ID, {
      view: 'inbox',
      limit: 50,
      q: 'Ponuka',
    });
    expect(found.items.map((thread) => [thread.id, thread.messageCount])).toEqual([
      [keeper.threadId, 1],
    ]);
    engine.claude.respondWith(() => [
      { type: 'completed', output: { kind: 'summary', summary: 'Ponuka.', checklist: [] } },
    ]);
    const job = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'summary', threadId: keeper.threadId },
    });
    await engine.services.ai.runJob(USER_ID, job.id);
    const request = present(engine.claude.requests.at(-1));
    expect(request.thread?.messages.map((message) => message.id)).toEqual([keeper.id]);
  });

  it('remaps every reference of a loser onto its keeper', async () => {
    const engine = createTestEngine();
    const { account, keeper, loser, flagOp, origin, draft } = await legacySetup(engine);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const tables = engine.db.tables;
    expect([...tables.automationRuns].sort()).toEqual(
      [`${RULE}:${keeper.id}`, `${LOSER_RULE}:${keeper.id}`].sort(),
    );
    expect((await engine.services.compose.getDraft(USER_ID, draft.id)).inReplyToMessageId).toBe(
      keeper.id,
    );
    expect(tables.calendarEvents.get(EVENT)?.messageId).toBe(keeper.id);
    expect(tables.aiResults.find((result) => result.id === RESULT)).toMatchObject({
      sourceMessageId: keeper.id,
      output: { messageId: keeper.id },
    });
    expect(tables.aiJobs.get(KEEPER_JOB)?.input).toMatchObject({ sourceMessageId: keeper.id });
    expect(tables.aiJobs.get(LOSER_JOB)?.input).toMatchObject({ sourceMessageId: loser.id });
    expect(tables.aiJobs.get(DONE_JOB)?.input).toMatchObject({ sourceMessageId: keeper.id });
    expect(tables.automationActivity.find((record) => record.id === ACTIVITY)).toMatchObject({
      messageId: keeper.id,
      actions: [
        {
          changed: [keeper.id],
          labelled: [keeper.id],
          origins: [{ messageId: keeper.id, revision: 'rev-1' }],
        },
      ],
    });
    expect(pendingOfKind(engine, 'provider-op')).toEqual([
      {
        ...flagOp,
        ref: `${keeper.id}:flag:flagged`,
        payload: { ...flagOp.payload, messageId: keeper.id },
      },
    ]);
    expect(pendingOfKind(engine, 'move-origin')).toEqual([
      { ...origin, ref: keeper.id, payload: { ...origin.payload, messageId: keeper.id } },
    ]);
    expect(stored(engine, keeper.id).flags).toEqual({ seen: true, flagged: true, answered: false });
    expectMergeInvariants(engine);
  });

  it('publishes the merged threads and queues a flag and label rescan', async () => {
    const engine = createTestEngine();
    const { account, keeper, unresolved } = await legacySetup(engine);
    engine.events.clear();

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const upserted = engine.events.ofType('thread.upserted').map((event) => event.data.thread.id);
    const unresolvedThread = stored(engine, unresolved.keeperId).threadId;
    expect(upserted).toEqual(expect.arrayContaining([keeper.threadId, unresolvedThread]));
    const states = await engine.repositories.syncStates.listByAccount(account.id);
    expect(
      pendingOfKind(engine, 'label-rescan')
        .map((work) => work.ref)
        .sort(),
    ).toEqual(states.map((state) => state.mailboxId).sort());
    expect(engine.logger.entries.some((entry) => entry.message === 'Copy merge progress')).toBe(
      true,
    );
  });

  it('retires after a verifying pass and restores server truth on the rescan', async () => {
    const engine = createTestEngine();
    const { account, server, keeper } = await legacySetup(engine);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect((await copyMergeRow(engine, account.id))?.payload.pass.merged).toBe(0);
    const merged = storedMessages(engine);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await copyMergeRow(engine, account.id)).toBeNull();
    expect(storedMessages(engine).map((message) => message.id)).toEqual(
      merged.map((message) => message.id),
    );
    expect(pendingOfKind(engine, 'label-rescan')).toEqual([]);
    expect(stored(engine, keeper.id).flags).toEqual({
      seen: false,
      flagged: true,
      answered: false,
    });
    server.failFlagWrites = null;

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.record('INBOX', keeper.uid).flags.flagged).toBe(true);
    expect(pendingOfKind(engine, 'provider-op')).toEqual([]);
    expectMergeInvariants(engine);
  });

  it('is a no-op when it runs again', async () => {
    const engine = createTestEngine();
    const { account } = await legacySetup(engine);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const before = engine.db.snapshot();
    await enqueueCopyMerge(engine, account.id);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(storedMessages(engine)).toEqual([...before.messages.values()]);
    expect([...engine.db.tables.messageAliases]).toEqual([...before.messageAliases]);
    expect(await copyMergeRow(engine, account.id)).toBeNull();
    expectMergeInvariants(engine);
  });
});
