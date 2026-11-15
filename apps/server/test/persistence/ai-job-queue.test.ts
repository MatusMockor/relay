import type { AiJobClaim } from '@relay/engine';
import type { AiJob, MessageId, ThreadId, UserId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  openPostgresConnection,
  type PostgresConnection,
} from '../../src/persistence/database/postgres-connection';
import { createPgRepositories } from '../../src/persistence/repositories/create-pg-repositories';
import { at, buildUser, newId, seedAccount, seedThread } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const buildJob = (userId: UserId, threadId: ThreadId, overrides: Partial<AiJob> = {}): AiJob => ({
  id: newId('aiJob'),
  userId,
  kind: 'oneLiner',
  status: 'queued',
  runnerLocation: 'server',
  runner: 'claude',
  input: { kind: 'oneLiner', threadId },
  output: null,
  error: null,
  createdAt: at(0),
  updatedAt: at(0),
  ...overrides,
});

const claimAt = (now: string, owner = 'worker-a'): AiJobClaim => ({
  owner,
  now,
  leaseUntil: new Date(Date.parse(now) + 60_000).toISOString(),
});

describe('PgAiJobRepository queue', () => {
  const context = usePgTestContext();

  const seeded = async () => {
    const account = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, account);
    return { userId: account.user.id, threadId: thread.id };
  };

  it('relocates only the queued jobs of one user to another location', async () => {
    const { userId, threadId } = await seeded();
    const other = await seeded();
    const { aiJobs } = context.repositories;
    const queued = await aiJobs.create(buildJob(userId, threadId, { runnerLocation: 'local' }));
    const done = await aiJobs.create(
      buildJob(userId, threadId, { runnerLocation: 'local', status: 'done' }),
    );
    const running = await aiJobs.create(buildJob(userId, threadId, { runnerLocation: 'local' }));
    await aiJobs.claim(running.id, claimAt(at(1)));
    const foreign = await aiJobs.create(
      buildJob(other.userId, other.threadId, { runnerLocation: 'local' }),
    );

    const moved = await aiJobs.relocateQueued(userId, 'server', at(2));

    expect(moved.map((job) => [job.id, job.runnerLocation, job.updatedAt])).toEqual([
      [queued.id, 'server', at(2)],
    ]);
    expect((await aiJobs.findById(userId, done.id))?.runnerLocation).toBe('local');
    expect((await aiJobs.findById(userId, running.id))?.runnerLocation).toBe('local');
    expect((await aiJobs.findById(other.userId, foreign.id))?.runnerLocation).toBe('local');
    expect(await aiJobs.relocateQueued(userId, 'server', at(3))).toEqual([]);
  });

  it('refuses a claim for another location, e.g. after the job was relocated', async () => {
    const { userId, threadId } = await seeded();
    const { aiJobs } = context.repositories;
    const job = await aiJobs.create(buildJob(userId, threadId));
    await aiJobs.relocateQueued(userId, 'local', at(1));

    await expect(
      aiJobs.claim(job.id, { ...claimAt(at(2)), location: 'server' }),
    ).resolves.toBeNull();
    await expect(
      aiJobs.claim(job.id, { ...claimAt(at(2)), location: 'local' }),
    ).resolves.toMatchObject({ status: 'running', runnerLocation: 'local' });
  });

  it('lists claimable jobs per location oldest first and claims each one once', async () => {
    const { userId, threadId } = await seeded();
    const { aiJobs } = context.repositories;
    const newer = await aiJobs.create(buildJob(userId, threadId, { createdAt: at(5) }));
    const older = await aiJobs.create(buildJob(userId, threadId, { createdAt: at(1) }));
    await aiJobs.create(buildJob(userId, threadId, { runnerLocation: 'local' }));
    await aiJobs.create(buildJob(userId, threadId, { status: 'done' }));

    const queued = await aiJobs.listQueued({ location: 'server', now: at(10), limit: 10 });
    const mine = queued.filter((job) => job.userId === userId).map((job) => job.id);
    expect(mine).toEqual([older.id, newer.id]);

    await expect(aiJobs.claim(older.id, claimAt(at(10)))).resolves.toMatchObject({
      id: older.id,
      status: 'running',
      updatedAt: at(10),
    });
    await expect(aiJobs.claim(older.id, claimAt(at(10), 'worker-b'))).resolves.toBeNull();
    const remaining = await aiJobs.listQueued({ location: 'server', now: at(10), limit: 10 });
    expect(remaining.map((job) => job.id)).not.toContain(older.id);
  });

  it('reclaims a running job only after its lease expired', async () => {
    const { userId, threadId } = await seeded();
    const { aiJobs } = context.repositories;
    const job = await aiJobs.create(
      buildJob(userId, threadId, { status: 'running' }),
      claimAt(at(0)),
    );

    await expect(aiJobs.claim(job.id, claimAt(at(0.5), 'worker-b'))).resolves.toBeNull();
    const later = await aiJobs.listQueued({ location: 'server', now: at(2), limit: 100 });
    expect(later.map((item) => item.id)).toContain(job.id);
    await expect(aiJobs.claim(job.id, claimAt(at(2), 'worker-b'))).resolves.toMatchObject({
      status: 'running',
    });
  });

  it('lets exactly one of many concurrent connections claim a job', async () => {
    const { userId, threadId } = await seeded();
    const job = await context.repositories.aiJobs.create(buildJob(userId, threadId));
    const connections: PostgresConnection[] = Array.from({ length: 5 }, () =>
      openPostgresConnection({ url: context.url, maxConnections: 1 }),
    );

    const results = await Promise.all(
      connections.map((connection, index) =>
        createPgRepositories(connection.db).aiJobs.claim(job.id, claimAt(at(1), `w${index}`)),
      ),
    );
    await Promise.all(connections.map((connection) => connection.close()));

    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });

  it('enqueues exactly one active job per source message across concurrent connections', async () => {
    const { userId, threadId } = await seeded();
    const sourced = (source: MessageId, overrides: Partial<AiJob> = {}): AiJob =>
      buildJob(userId, threadId, {
        input: { kind: 'oneLiner', threadId, sourceMessageId: source },
        ...overrides,
      });
    const source = newId('message');
    const connections: PostgresConnection[] = Array.from({ length: 5 }, () =>
      openPostgresConnection({ url: context.url, maxConnections: 1 }),
    );

    const results = await Promise.all(
      connections.map((connection) =>
        createPgRepositories(connection.db).aiJobs.enqueueIfAbsent(sourced(source)),
      ),
    );
    await Promise.all(connections.map((connection) => connection.close()));

    const created = results.filter((result) => result.created);
    expect(created).toHaveLength(1);
    const winner = created[0]?.job;
    expect(winner).toBeDefined();
    if (winner === undefined || winner === null) {
      return;
    }
    expect(new Set(results.map((result) => result.job?.id))).toEqual(new Set([winner.id]));
    const { aiJobs } = context.repositories;
    expect(await aiJobs.findById(userId, winner.id)).toEqual(winner);
    await expect(aiJobs.enqueueIfAbsent(sourced(newId('message')))).resolves.toMatchObject({
      created: true,
    });
    await expect(
      aiJobs.enqueueIfAbsent(
        sourced(source, {
          kind: 'summary',
          input: { kind: 'summary', threadId, sourceMessageId: source },
        }),
      ),
    ).resolves.toMatchObject({ created: true });
    await aiJobs.claim(winner.id, claimAt(at(1)));
    await expect(aiJobs.enqueueIfAbsent(sourced(source))).resolves.toMatchObject({
      created: false,
      job: { id: winner.id, status: 'running' },
    });
    await aiJobs.update(winner.id, { status: 'error', updatedAt: at(2) });
    await expect(aiJobs.enqueueIfAbsent(sourced(source))).resolves.toMatchObject({ created: true });
    await expect(aiJobs.enqueueIfAbsent(buildJob(userId, threadId))).resolves.toMatchObject({
      created: true,
    });
    await expect(aiJobs.enqueueIfAbsent(buildJob(userId, threadId))).resolves.toMatchObject({
      created: true,
    });
  });

  it('finds a newer finished job of the same user, thread and kind', async () => {
    const { userId, threadId } = await seeded();
    const { aiJobs } = context.repositories;
    const older = await aiJobs.create(buildJob(userId, threadId));
    await expect(aiJobs.hasNewerDone(older)).resolves.toBe(false);
    await aiJobs.create(buildJob(userId, threadId, { status: 'done', createdAt: at(5) }));
    await aiJobs.create(
      buildJob(userId, threadId, {
        kind: 'summary',
        status: 'done',
        createdAt: at(6),
        input: { kind: 'summary', threadId },
      }),
    );

    await expect(aiJobs.hasNewerDone(older)).resolves.toBe(true);
    await expect(
      aiJobs.hasNewerDone(buildJob(userId, threadId, { createdAt: at(5) })),
    ).resolves.toBe(false);
  });

  it('fences updates and renews the lease only for the current owner', async () => {
    const { userId, threadId } = await seeded();
    const { aiJobs } = context.repositories;
    const job = await aiJobs.create(buildJob(userId, threadId));
    await aiJobs.claim(job.id, claimAt(at(0), 'worker-a:1'));
    await expect(
      aiJobs.update(job.id, {
        status: 'running',
        updatedAt: at(0.5),
        owner: 'worker-a:1',
        leaseUntil: at(5),
      }),
    ).resolves.toMatchObject({ status: 'running' });
    const renewed = await aiJobs.listQueued({ location: 'server', now: at(2), limit: 100 });
    expect(renewed.map((item) => item.id)).not.toContain(job.id);

    await expect(aiJobs.claim(job.id, claimAt(at(6), 'worker-b:1'))).resolves.not.toBeNull();
    await expect(
      aiJobs.update(job.id, { status: 'done', updatedAt: at(6.5), owner: 'worker-a:1' }),
    ).resolves.toBeNull();
    await expect(aiJobs.findById(userId, job.id)).resolves.toMatchObject({ status: 'running' });
  });
});

describe('PgAiResultRepository.updateChecklistItem', () => {
  const context = usePgTestContext();

  const saveSummary = async () => {
    const account = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, account);
    const result = await context.repositories.aiResults.save({
      id: newId('aiResult'),
      userId: account.user.id,
      threadId: thread.id,
      sourceMessageId: null,
      runner: 'claude',
      output: {
        kind: 'summary',
        summary: 'S',
        checklist: [
          { id: 'c1', text: 'A', done: false },
          { id: 'c2', text: 'B', done: false },
        ],
      },
      createdAt: at(0),
    });
    return { userId: account.user.id, threadId: thread.id, resultId: result.id };
  };

  it('ticks one item of an owned summary only', async () => {
    const { userId, resultId } = await saveSummary();
    const { aiResults } = context.repositories;

    await expect(
      aiResults.updateChecklistItem(buildUser().id, resultId, { itemId: 'c1', done: true }),
    ).resolves.toBeNull();
    await expect(
      aiResults.updateChecklistItem(userId, resultId, { itemId: 'nope', done: true }),
    ).resolves.toBeNull();
    await expect(
      aiResults.updateChecklistItem(userId, resultId, { itemId: 'c1', done: true }),
    ).resolves.toMatchObject({ output: { checklist: [{ done: true }, { done: false }] } });
  });

  it('keeps concurrent ticks of different items', async () => {
    const { userId, threadId, resultId } = await saveSummary();
    const connections: PostgresConnection[] = [0, 1].map(() =>
      openPostgresConnection({ url: context.url, maxConnections: 1 }),
    );

    await Promise.all(
      ['c1', 'c2'].map((itemId, index) =>
        createPgRepositories(connections[index]?.db ?? context.db).aiResults.updateChecklistItem(
          userId,
          resultId,
          { itemId, done: true },
        ),
      ),
    );
    await Promise.all(connections.map((connection) => connection.close()));

    await expect(
      context.repositories.aiResults.findLatest(userId, threadId, 'summary'),
    ).resolves.toMatchObject({ output: { checklist: [{ done: true }, { done: true }] } });
  });
});
