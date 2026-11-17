import { describe, expect, it } from 'vitest';
import { seedAccount } from '../support/fixtures';
import { cancelOne, master, rows } from '../support/range-invites';
import { deliverAt, sync } from '../support/rebuild-invites';
import { createTestEngine, type TestEngine } from '../support/test-engine';

const LATER = '2026-11-30T09:00:00.000Z';
const at = (hour: number): string => `2026-11-15T${String(hour).padStart(2, '0')}:00:00.000Z`;
const day = (date: number): string => `2026-11-0${String(date)}T08:00:00.000Z`;

const inviteWork = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === 'calendar-invite');

describe('SyncService initial sync calendar invitations', () => {
  it('holds invitations until the initial sync is complete and applies them in arrival order', async () => {
    const engine = createTestEngine({ sync: { batchSize: 1 } });
    const seeded = await seedAccount(engine);
    deliverAt(engine, seeded, 'series', master({ dtstamp: at(10) }), day(3));
    deliverAt(
      engine,
      seeded,
      'all',
      cancelOne(LATER, { recurrenceId: null, sequence: 1, dtstamp: at(11) }),
      day(4),
    );
    seeded.server.interruptStreamAfter = 1;

    const interrupted = await sync(engine, seeded);

    expect(interrupted.ok).toBe(false);
    expect(rows(engine)).toEqual([]);
    expect(inviteWork(engine).map((work) => work.payload)).toMatchObject([{ held: true }]);

    const resumed = await sync(engine, seeded);

    expect(resumed.ok).toBe(true);
    expect(rows(engine).find((row) => row.recurrenceId === null)).toMatchObject({
      status: 'cancelled',
      sequence: 1,
    });
    expect(inviteWork(engine)).toEqual([]);
  });
});
