import { describe, expect, it } from 'vitest';
import { addAutomations, automationInput, notifiedSubjects, TIBOR } from '../support/automations';
import { enqueueCopyMerge, pendingOfKind, storedMessages } from '../support/copy-merge';
import { present } from '../support/fixtures';
import { type LegacySpec, seedLegacyDuplicates } from '../support/legacy-duplicates';
import { createTestEngine, TEST_NOW, USER_ID } from '../support/test-engine';

const SPEC: LegacySpec = {
  id: 'd1',
  subject: 'Ponuka od Tibora',
  from: TIBOR,
  date: '2026-11-14T08:00:00.000Z',
};

describe('CopyMergeBackfill durability', () => {
  it('delivers a buffered loser arrival once, as the keeper', async () => {
    const engine = createTestEngine();
    const { account, pairs } = await seedLegacyDuplicates(engine, [SPEC]);
    const pair = present(pairs[0]);
    const loser = present(engine.db.tables.messages.get(pair.loserId));
    const rules = await addAutomations(engine, [automationInput({ name: 'Tibor' })]);
    const rule = present(rules.find((automation) => automation.name === 'Tibor'));
    await engine.repositories.pendingWork.put({
      accountId: account.id,
      kind: 'message-effects',
      ref: loser.id,
      payload: {
        messageId: loser.id,
        threadId: loser.threadId,
        publish: false,
        arrival: true,
        live: true,
        jira: null,
        headers: [],
      },
      createdAt: TEST_NOW,
    });
    await enqueueCopyMerge(engine, account.id);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(storedMessages(engine).map((message) => message.id)).toEqual([pair.keeperId]);
    expect(notifiedSubjects(engine)).toEqual([SPEC.subject]);
    expect([...engine.db.tables.automationRuns]).toEqual([`${rule.id}:${pair.keeperId}`]);
    expect(pendingOfKind(engine, 'message-effects')).toEqual([]);
  });

  it('keeps the flag and label rescan when the sync stops right after a merged chunk', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedLegacyDuplicates(engine, [SPEC]);
    await enqueueCopyMerge(engine, account.id);
    engine.events.failing = 'thread.upserted';

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(storedMessages(engine)).toHaveLength(1);
    const states = await engine.repositories.syncStates.listByAccount(account.id);
    expect(
      pendingOfKind(engine, 'label-rescan')
        .map((work) => work.ref)
        .sort(),
    ).toEqual(states.map((state) => state.mailboxId).sort());
    engine.events.failing = null;
    server.flagScans.length = 0;

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(pendingOfKind(engine, 'label-rescan')).toEqual([]);
    expect(server.flagScans.map((scan) => scan.path).sort()).toEqual(
      expect.arrayContaining(['Archive', 'INBOX']),
    );
  });
});
