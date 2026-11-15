import { type AiJob, AiJobIdSchema } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, LOCAL_USER_ID, migrate, openDatabase } from '../src';
import type { SqliteDatabase } from '../src';
import { messageId, threadId, userId } from './support/fixtures';
import {
  createTempDirectory,
  createTestStore,
  type TempDirectory,
  tempDatabasePath,
} from './support/test-database';

const buildJob = (id: string, overrides: Partial<AiJob> = {}): AiJob => ({
  id: AiJobIdSchema.parse(id),
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

describe('SqliteAiJobRepository.enqueueIfAbsent', () => {
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

  it('enqueues one active job per thread, kind and source message', async () => {
    const { aiJobs } = memoryRepositories();
    const sourced = (id: string, source: string, overrides: Partial<AiJob> = {}): AiJob =>
      buildJob(id, {
        input: {
          kind: 'oneLiner',
          threadId: threadId('thr-1'),
          sourceMessageId: messageId(source),
        },
        ...overrides,
      });

    const outcomes = await Promise.all(
      ['job-1', 'job-2', 'job-3', 'job-4'].map((id) =>
        aiJobs.enqueueIfAbsent(sourced(id, 'msg-1')),
      ),
    );

    const created = outcomes.filter((outcome) => outcome.created);
    expect(created).toHaveLength(1);
    const winner = created[0]?.job;
    expect(winner).toBeDefined();
    if (winner === undefined || winner === null) {
      return;
    }
    expect(outcomes.map((outcome) => outcome.job?.id)).toEqual([
      winner.id,
      winner.id,
      winner.id,
      winner.id,
    ]);
    expect(await aiJobs.findById(LOCAL_USER_ID, winner.id)).toEqual(winner);
    expect(await aiJobs.enqueueIfAbsent(sourced('job-new-source', 'msg-2'))).toMatchObject({
      created: true,
    });
    expect(
      await aiJobs.enqueueIfAbsent(
        sourced('job-intruder', 'msg-1', { userId: userId('intruder') }),
      ),
    ).toMatchObject({ created: true });
    expect(
      await aiJobs.enqueueIfAbsent(
        sourced('job-summary', 'msg-1', {
          kind: 'summary',
          input: {
            kind: 'summary',
            threadId: threadId('thr-1'),
            sourceMessageId: messageId('msg-1'),
          },
        }),
      ),
    ).toMatchObject({ created: true });

    await aiJobs.claim(winner.id, {
      owner: 'worker-a',
      now: '2026-11-10T10:00:01.000Z',
      leaseUntil: '2026-11-10T10:01:01.000Z',
    });
    expect(await aiJobs.enqueueIfAbsent(sourced('job-while-running', 'msg-1'))).toMatchObject({
      created: false,
      job: { id: winner.id, status: 'running' },
    });
    await aiJobs.update(winner.id, { status: 'done', updatedAt: '2026-11-10T10:00:02.000Z' });
    expect(await aiJobs.enqueueIfAbsent(sourced('job-after-done', 'msg-1'))).toMatchObject({
      created: true,
    });
    expect(await aiJobs.enqueueIfAbsent(buildJob('job-unsourced-1'))).toMatchObject({
      created: true,
    });
    expect(await aiJobs.enqueueIfAbsent(buildJob('job-unsourced-2'))).toMatchObject({
      created: true,
    });
  });

  it('keeps the unique source across two connections to the same file', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const path = tempDatabasePath(directory);
    const first = openDatabase(path);
    opened.push(first);
    migrate(first);
    const second = openDatabase(path);
    opened.push(second);
    const job = (id: string): AiJob =>
      buildJob(id, {
        input: { kind: 'oneLiner', threadId: threadId('thr-1'), sourceMessageId: messageId('m-1') },
      });

    const outcomes = await Promise.all([
      createSqliteRepositories(first).aiJobs.enqueueIfAbsent(job('job-a')),
      createSqliteRepositories(second).aiJobs.enqueueIfAbsent(job('job-b')),
    ]);

    expect(outcomes.filter((outcome) => outcome.created)).toHaveLength(1);
  });

  it('finds a newer finished job of the same thread and kind', async () => {
    const { aiJobs } = memoryRepositories();
    const older = await aiJobs.create(buildJob('job-old'));
    await aiJobs.create(
      buildJob('job-new', { status: 'done', createdAt: '2026-11-10T10:05:00.000Z' }),
    );
    await aiJobs.create(
      buildJob('job-other-thread', {
        status: 'done',
        createdAt: '2026-11-10T10:06:00.000Z',
        input: { kind: 'oneLiner', threadId: threadId('thr-2') },
      }),
    );

    expect(await aiJobs.hasNewerDone(older)).toBe(true);
    expect(
      await aiJobs.hasNewerDone(buildJob('job-x', { createdAt: '2026-11-10T10:05:00.000Z' })),
    ).toBe(false);
    expect(
      await aiJobs.hasNewerDone(
        buildJob('job-y', {
          kind: 'summary',
          input: { kind: 'summary', threadId: threadId('thr-1') },
        }),
      ),
    ).toBe(false);
  });
});
