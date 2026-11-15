import type { AiJobClaim } from '@relay/engine';
import { type AiJob, AiJobIdSchema, AiResultIdSchema } from '@relay/shared/domain';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSqliteRepositories,
  LOCAL_USER_ID,
  migrate,
  openDatabase,
  SQLITE_MIGRATIONS_FOLDER,
} from '../src';
import type { SqliteDatabase } from '../src';
import { threadId, userId } from './support/fixtures';
import {
  createTempDirectory,
  createTestStore,
  type TempDirectory,
  tempDatabasePath,
} from './support/test-database';

const jobId = (value: string) => AiJobIdSchema.parse(value);

const buildJob = (id: string, overrides: Partial<AiJob> = {}): AiJob => ({
  id: jobId(id),
  userId: LOCAL_USER_ID,
  kind: 'oneLiner',
  status: 'queued',
  runnerLocation: 'local',
  runner: 'claude',
  input: { kind: 'oneLiner', threadId: threadId('thr-1') },
  output: null,
  error: null,
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

const claimAt = (now: string, owner = 'worker-a'): AiJobClaim => ({
  owner,
  now,
  leaseUntil: new Date(Date.parse(now) + 60_000).toISOString(),
});

describe('SqliteAiJobRepository queue', () => {
  const opened: SqliteDatabase[] = [];
  const directories: TempDirectory[] = [];

  afterEach(() => {
    opened.splice(0).forEach((database) => {
      database.close();
    });
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  const memoryRepositories = () => {
    const store = createTestStore();
    opened.push(store.database);
    return store.repositories;
  };

  it('lists claimable jobs per location, oldest first, and claims each one once', async () => {
    const { aiJobs } = memoryRepositories();
    await aiJobs.create(buildJob('job-new', { createdAt: '2026-11-10T11:00:00.000Z' }));
    await aiJobs.create(buildJob('job-old', { createdAt: '2026-11-10T09:00:00.000Z' }));
    await aiJobs.create(buildJob('job-server', { runnerLocation: 'server' }));
    await aiJobs.create(buildJob('job-done', { status: 'done' }));
    const now = '2026-11-10T12:00:00.000Z';

    const queued = await aiJobs.listQueued({ location: 'local', now, limit: 10 });
    expect(queued.map((job) => job.id)).toEqual(['job-old', 'job-new']);
    expect(await aiJobs.listQueued({ location: 'local', now, limit: 1 })).toHaveLength(1);

    const claimed = await aiJobs.claim(jobId('job-old'), claimAt(now));
    expect(claimed).toMatchObject({ id: 'job-old', status: 'running', updatedAt: now });
    expect(await aiJobs.claim(jobId('job-old'), claimAt(now, 'worker-b'))).toBeNull();
    expect(await aiJobs.claim(jobId('job-done'), claimAt(now))).toBeNull();
    expect(
      (await aiJobs.listQueued({ location: 'local', now, limit: 10 })).map((job) => job.id),
    ).toEqual(['job-new']);
  });

  it('makes a running job claimable again only after its lease expired', async () => {
    const { aiJobs } = memoryRepositories();
    const start = '2026-11-10T12:00:00.000Z';
    await aiJobs.create(buildJob('job-1', { status: 'running' }), claimAt(start));
    await aiJobs.create(buildJob('job-legacy', { status: 'running' }));

    const later = '2026-11-10T12:00:30.000Z';
    expect(await aiJobs.listQueued({ location: 'local', now: later, limit: 10 })).toEqual([]);
    expect(await aiJobs.claim(jobId('job-1'), claimAt(later, 'worker-b'))).toBeNull();

    const expired = '2026-11-10T12:01:01.000Z';
    expect(
      (await aiJobs.listQueued({ location: 'local', now: expired, limit: 10 })).map(
        (job) => job.id,
      ),
    ).toEqual(['job-1']);
    expect(await aiJobs.claim(jobId('job-1'), claimAt(expired, 'worker-b'))).toMatchObject({
      status: 'running',
    });
  });

  it('reports a job as held only by its current owner while the lease is live', async () => {
    const { aiJobs } = memoryRepositories();
    const start = '2026-11-10T12:00:00.000Z';
    await aiJobs.create(buildJob('job-1', { status: 'running' }), claimAt(start));
    const held = (owner: string, now: string, user = LOCAL_USER_ID) =>
      aiJobs.isHeldBy(user, jobId('job-1'), owner, now);

    expect(await held('worker-a', '2026-11-10T12:01:00.000Z')).toBe(true);
    expect(await held('worker-b', start)).toBe(false);
    expect(await held('worker-a', start, userId('intruder'))).toBe(false);
    expect(await held('worker-a', '2026-11-10T12:01:01.000Z')).toBe(false);

    const reclaimed = '2026-11-10T12:01:01.000Z';
    await aiJobs.claim(jobId('job-1'), claimAt(reclaimed, 'worker-b'));
    expect(await held('worker-a', reclaimed)).toBe(false);
    expect(await held('worker-b', reclaimed)).toBe(true);
    await aiJobs.update(jobId('job-1'), {
      status: 'done',
      updatedAt: reclaimed,
      owner: 'worker-b',
      fromStatus: 'running',
    });
    expect(await held('worker-b', reclaimed)).toBe(false);
  });

  it('relocates only the queued jobs of one user to another location', async () => {
    const { aiJobs } = memoryRepositories();
    await aiJobs.create(buildJob('job-1'));
    await aiJobs.create(buildJob('job-2', { status: 'done' }));
    await aiJobs.create(buildJob('job-3', { runnerLocation: 'server' }));
    await aiJobs.create(buildJob('job-4', { userId: userId('other') }));
    await aiJobs.create(buildJob('job-5'));
    await aiJobs.claim(jobId('job-5'), claimAt('2026-11-10T10:00:01.000Z'));
    const now = '2026-11-10T11:00:00.000Z';

    const moved = await aiJobs.relocateQueued(LOCAL_USER_ID, 'server', now);

    expect(moved.map((job) => [job.id, job.runnerLocation, job.updatedAt])).toEqual([
      ['job-1', 'server', now],
    ]);
    const queued = await aiJobs.listQueued({ location: 'server', now, limit: 10 });
    expect(queued.map((job) => job.id).sort()).toEqual(['job-1', 'job-3']);
    expect((await aiJobs.findById(LOCAL_USER_ID, jobId('job-2')))?.runnerLocation).toBe('local');
    expect((await aiJobs.findById(LOCAL_USER_ID, jobId('job-5')))?.runnerLocation).toBe('local');
    expect((await aiJobs.findById(userId('other'), jobId('job-4')))?.runnerLocation).toBe('local');
  });

  it('fences updates and renews the lease only for the current owner', async () => {
    const { aiJobs } = memoryRepositories();
    await aiJobs.create(buildJob('job-1'));
    const first = claimAt('2026-11-10T12:00:00.000Z', 'worker-a:1');
    await aiJobs.claim(jobId('job-1'), first);
    const renewed = await aiJobs.update(jobId('job-1'), {
      status: 'running',
      updatedAt: '2026-11-10T12:00:50.000Z',
      owner: 'worker-a:1',
      leaseUntil: '2026-11-10T12:05:00.000Z',
    });
    expect(renewed?.status).toBe('running');
    expect(
      await aiJobs.listQueued({ location: 'local', now: '2026-11-10T12:02:00.000Z', limit: 10 }),
    ).toEqual([]);

    const stolen = claimAt('2026-11-10T12:06:00.000Z', 'worker-b:1');
    expect(await aiJobs.claim(jobId('job-1'), stolen)).not.toBeNull();
    expect(
      await aiJobs.update(jobId('job-1'), {
        status: 'done',
        updatedAt: '2026-11-10T12:06:01.000Z',
        owner: 'worker-a:1',
      }),
    ).toBeNull();
    expect((await aiJobs.findById(LOCAL_USER_ID, jobId('job-1')))?.status).toBe('running');
  });

  it('refuses a claim for another location, e.g. after the job was relocated', async () => {
    const { aiJobs } = memoryRepositories();
    await aiJobs.create(buildJob('job-1'));
    await aiJobs.relocateQueued(LOCAL_USER_ID, 'server', '2026-11-10T10:00:01.000Z');
    const now = '2026-11-10T10:00:02.000Z';

    expect(await aiJobs.claim(jobId('job-1'), { ...claimAt(now), location: 'local' })).toBeNull();
    expect(
      await aiJobs.claim(jobId('job-1'), { ...claimAt(now), location: 'server' }),
    ).toMatchObject({ status: 'running', runnerLocation: 'server' });
  });

  it('lets only one of two connections claim the same job', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const path = tempDatabasePath(directory);
    const first = openDatabase(path);
    opened.push(first);
    migrate(first);
    const second = openDatabase(path);
    opened.push(second);
    const a = createSqliteRepositories(first);
    const b = createSqliteRepositories(second);
    await a.aiJobs.create(buildJob('job-1'));
    const now = '2026-11-10T12:00:00.000Z';

    const results = await Promise.all([
      a.aiJobs.claim(jobId('job-1'), claimAt(now, 'process-a')),
      b.aiJobs.claim(jobId('job-1'), claimAt(now, 'process-b')),
    ]);

    expect(results.filter((job) => job !== null)).toHaveLength(1);
  });

  it('migrates jobs created before the queue columns existed', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const oldFolder = join(directory.path, 'drizzle-old');
    cpSync(SQLITE_MIGRATIONS_FOLDER, oldFolder, { recursive: true });
    const journalPath = join(oldFolder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
    writeFileSync(
      journalPath,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }),
    );
    const database = openDatabase(tempDatabasePath(directory));
    opened.push(database);
    migrate(database, { migrationsFolder: oldFolder });
    database.sqlite
      .prepare(
        `insert into ai_jobs (id, user_id, kind, status, runner_location, runner, input, created_at, updated_at)
         values ('job-old', 'local', 'oneLiner', 'queued', 'local', 'claude', '{"kind":"oneLiner","threadId":"thr-1"}', '2026-11-10T10:00:00.000Z', '2026-11-10T10:00:00.000Z'),
                ('job-stuck', 'local', 'summary', 'running', 'local', 'claude', '{"kind":"summary","threadId":"thr-1"}', '2026-11-10T09:00:00.000Z', '2026-11-10T09:00:00.000Z')`,
      )
      .run();

    migrate(database);
    const { aiJobs } = createSqliteRepositories(database);

    expect(
      (
        await aiJobs.listQueued({ location: 'local', now: '2026-11-10T12:00:00.000Z', limit: 10 })
      ).map((job) => job.id),
    ).toEqual(['job-stuck', 'job-old']);
    expect(
      database.sqlite
        .prepare<[], { created_ts: number }>("select created_ts from ai_jobs where id = 'job-old'")
        .get(),
    ).toEqual({ created_ts: Date.parse('2026-11-10T10:00:00.000Z') });
  });
});

describe('SqliteAiResultRepository.updateChecklistItem', () => {
  const summary = (id: string) => ({
    id: AiResultIdSchema.parse(id),
    userId: LOCAL_USER_ID,
    threadId: threadId('thr-1'),
    sourceMessageId: null,
    runner: 'claude' as const,
    output: {
      kind: 'summary' as const,
      summary: 'S',
      checklist: [
        { id: 'c1', text: 'A', done: false },
        { id: 'c2', text: 'B', done: false },
      ],
    },
    createdAt: '2026-11-10T10:00:00.000Z',
  });

  it('ticks one item of an owned summary only', async () => {
    const store = createTestStore();
    const { aiResults } = store.repositories;
    await aiResults.save(summary('air-1'));
    const id = AiResultIdSchema.parse('air-1');

    expect(
      await aiResults.updateChecklistItem(userId('intruder'), id, { itemId: 'c1', done: true }),
    ).toBeNull();
    expect(
      await aiResults.updateChecklistItem(LOCAL_USER_ID, id, { itemId: 'nope', done: true }),
    ).toBeNull();
    expect(
      await aiResults.updateChecklistItem(LOCAL_USER_ID, id, { itemId: 'c1', done: true }),
    ).toMatchObject({ output: { checklist: [{ done: true }, { done: false }] } });
    store.database.close();
  });

  it('keeps concurrent ticks of different items from two connections', async () => {
    const directory = createTempDirectory();
    const first = openDatabase(tempDatabasePath(directory));
    migrate(first);
    const second = openDatabase(tempDatabasePath(directory));
    const a = createSqliteRepositories(first);
    const b = createSqliteRepositories(second);
    await a.aiResults.save(summary('air-2'));
    const id = AiResultIdSchema.parse('air-2');

    await Promise.all([
      a.aiResults.updateChecklistItem(LOCAL_USER_ID, id, { itemId: 'c1', done: true }),
      b.aiResults.updateChecklistItem(LOCAL_USER_ID, id, { itemId: 'c2', done: true }),
    ]);

    const latest = await a.aiResults.findLatest(LOCAL_USER_ID, threadId('thr-1'), 'summary');
    expect(latest?.output).toMatchObject({ checklist: [{ done: true }, { done: true }] });
    first.close();
    second.close();
    directory.remove();
  });
});
