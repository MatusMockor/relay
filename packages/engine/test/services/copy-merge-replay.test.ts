import type { ThreadSummary } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { enqueueCopyMerge, expectMergeInvariants, pendingOfKind } from '../support/copy-merge';
import { present } from '../support/fixtures';
import { seedLegacyDuplicates } from '../support/legacy-duplicates';
import { createTestEngine, USER_ID } from '../support/test-engine';

const SPEC = { id: 'c1', subject: 'Súbežne', date: '2026-11-14T08:00:00.000Z' };

describe('CopyMergeBackfill with a concurrent action-time replay', () => {
  it('re-keys a loser flag op that is being mirrored and replays it again idempotently', async () => {
    const engine = createTestEngine();
    const { account, server, pairs } = await seedLegacyDuplicates(engine, [SPEC]);
    const pair = present(pairs[0]);
    const keeper = present(engine.db.tables.messages.get(pair.keeperId));
    await engine.repositories.messages.updateFlags(keeper.id, { ...keeper.flags, seen: true });
    await enqueueCopyMerge(engine, account.id);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    server.beforeFlagWrite = () => {
      writes += 1;
      return gate;
    };
    const actions: Promise<ThreadSummary>[] = [];
    const refsAtMerge: string[][] = [];
    engine.events.beforePublish = (event) => {
      if (actions.length === 0 && event.type === 'sync.progress') {
        if (event.data.phase !== 'mailboxes') {
          return;
        }
        actions.push(engine.services.actions.apply(USER_ID, keeper.threadId, { type: 'markRead' }));
        return;
      }
      if (actions.length > 0 && refsAtMerge.length === 0 && event.type === 'thread.upserted') {
        refsAtMerge.push(pendingOfKind(engine, 'provider-op').map((work) => work.ref));
        release();
      }
    };

    await engine.services.sync.syncAccount(USER_ID, account.id);
    await Promise.all(actions);

    expect(refsAtMerge).toEqual([[`${keeper.id}:flag:seen`]]);
    expect(writes).toBe(2);
    expect(server.record('Archive', pair.allMailUid).flags.seen).toBe(true);
    expect(present(engine.db.tables.messages.get(keeper.id)).flags.seen).toBe(true);
    expect(engine.db.tables.messages.has(pair.loserId)).toBe(false);
    expect(pendingOfKind(engine, 'provider-op')).toEqual([]);
    expectMergeInvariants(engine);
  });
});
