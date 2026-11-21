import { refreshThread } from '@relay/engine';
import type { Split, ThreadSummary } from '@relay/shared/domain';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import type { ServerRepositories } from '../../src/core/ports/server-unit-of-work';
import { PgUnitOfWork } from '../../src/persistence/unit-of-work/pg-unit-of-work';
import { at, newId, seedAccount, seedThread, type SeededAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const lockWaiters = async (url: string): Promise<number> => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
};

describe('thread refresh racing a concurrent thread write (Postgres)', () => {
  const context = usePgTestContext();

  const refreshWhileHeld = async (
    seeded: SeededAccount,
    thread: ThreadSummary,
    write: (repositories: ServerRepositories) => Promise<unknown>,
  ): Promise<ThreadSummary | null> => {
    const unitOfWork = new PgUnitOfWork(context.db);
    const gate: { release: () => void } = { release: () => undefined };
    const released = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    const written = { done: false };
    const holder = unitOfWork.run(async (repositories) => {
      await write(repositories);
      written.done = true;
      await released;
    });
    const refresh = { done: Promise.resolve<unknown>(null) };
    try {
      await expect.poll(() => written.done).toBe(true);
      refresh.done = unitOfWork.run((repositories) =>
        refreshThread(repositories, seeded.user.id, seeded.account.id, thread.id),
      );
      await expect.poll(() => lockWaiters(context.url)).toBe(1);
    } finally {
      gate.release();
      await Promise.allSettled([holder, refresh.done]);
    }
    await expect(holder).resolves.toBeUndefined();
    await expect(refresh.done).resolves.toMatchObject({ kind: 'upserted' });
    return context.repositories.threads.findById(seeded.user.id, thread.id);
  };

  it('keeps a reminder committed while a sync refresh of the same thread was waiting', async () => {
    const seeded = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);

    const stored = await refreshWhileHeld(seeded, thread, (repositories) =>
      repositories.threads.updateState(seeded.user.id, thread.id, {
        state: 'reminder',
        remindAt: at(120),
      }),
    );

    expect(stored).toMatchObject({ state: 'reminder', remindAt: at(120) });
  });

  it('keeps split membership committed while a sync refresh of the same thread was waiting', async () => {
    const seeded = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);
    const split: Split = {
      id: newId('split'),
      userId: seeded.user.id,
      accountId: null,
      name: 'Newsletter',
      order: 0,
      match: 'any',
      exceptions: [],
      rules: [{ type: 'fromDomain', domain: 'news.sk' }],
      exclusive: true,
      hideTasks: false,
    };
    await context.repositories.splits.replaceAll(seeded.user.id, [split]);

    const stored = await refreshWhileHeld(seeded, thread, (repositories) =>
      repositories.threads.upsert({ ...thread, splitIds: [split.id] }),
    );

    expect(stored?.splitIds).toEqual([split.id]);
  });
});
