import type { AiJob, AiJobId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, TEST_NOW, type TestEngine, USER_ID } from '../support/test-engine';

const MANUAL_AI = { ai: { oneLinersPerSync: 0 } };

const syncedThreadId = async (engine: TestEngine): Promise<ThreadId> => {
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', { id: 'm1', subject: 'Invoice 42', body: 'Please pay by Friday' });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  return present(page.items[0]).id;
};

const storedJob = (threadId: ThreadId, id: string, overrides: Partial<AiJob> = {}): AiJob => ({
  id: id as AiJobId,
  userId: USER_ID,
  kind: 'oneLiner',
  status: 'queued',
  runnerLocation: 'local',
  runner: 'claude',
  input: { kind: 'oneLiner', threadId },
  output: null,
  error: null,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  ...overrides,
});

const answer = (engine: TestEngine, text: string): void => {
  engine.claude.respondWith(() => [{ type: 'completed', output: { kind: 'oneLiner', text } }]);
};

describe('persistent AI queue', () => {
  it('runs jobs that are only stored in the repository, e.g. after a restart', async () => {
    const engine = createTestEngine(MANUAL_AI);
    const threadId = await syncedThreadId(engine);
    answer(engine, 'Faktúra na úhradu');
    await engine.repositories.aiJobs.create(storedJob(threadId, 'job_before_restart'));
    await engine.repositories.aiJobs.create(
      storedJob(threadId, 'job_for_server', { runnerLocation: 'server' }),
    );

    const processed = await engine.services.ai.processQueued();

    expect(processed.map((job) => [job.id, job.status])).toEqual([['job_before_restart', 'done']]);
    expect(await engine.services.ai.processQueued()).toEqual([]);
    expect((await engine.repositories.threads.findById(USER_ID, threadId))?.aiOneLiner).toBe(
      'Faktúra na úhradu',
    );
  });

  it('never runs the same job twice, even when two workers race for it', async () => {
    const engine = createTestEngine(MANUAL_AI);
    const threadId = await syncedThreadId(engine);
    answer(engine, 'Raz');
    const job = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'oneLiner', threadId },
    });

    const outcomes = await Promise.allSettled([
      engine.services.ai.runJob(USER_ID, job.id),
      engine.services.ai.runJob(USER_ID, job.id),
      engine.services.ai.processQueued(),
    ]);

    const finished = outcomes.flatMap((outcome) => {
      if (outcome.status === 'rejected') {
        return [];
      }
      return Array.isArray(outcome.value) ? outcome.value : [outcome.value];
    });
    expect(finished.map((item) => [item.id, item.status])).toEqual([[job.id, 'done']]);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(2);
    expect(engine.claude.requests).toHaveLength(1);
  });

  it('reclaims a running job whose lease expired because its worker died', async () => {
    const engine = createTestEngine(MANUAL_AI);
    const threadId = await syncedThreadId(engine);
    const lease = { owner: 'dead-worker', now: TEST_NOW, leaseUntil: '2026-11-15T10:03:00.000Z' };
    await engine.repositories.aiJobs.create(
      storedJob(threadId, 'job_abandoned', { status: 'running' }),
      lease,
    );
    answer(engine, 'Znova');

    expect(await engine.services.ai.processQueued()).toEqual([]);
    engine.clock.advance(4 * 60_000);
    const [recovered] = await engine.services.ai.processQueued();

    expect(recovered).toMatchObject({ id: 'job_abandoned', status: 'done' });
  });

  it('keeps streamed jobs away from the queue while they run', async () => {
    const engine = createTestEngine(MANUAL_AI);
    answer(engine, 'unused');
    engine.claude.respondWith(() => [
      { type: 'started', runner: 'claude' },
      { type: 'completed', output: { kind: 'chatAnswer', text: 'Ahoj', references: [] } },
    ]);
    const stream = engine.services.ai.run(USER_ID, {
      input: { kind: 'chatAnswer', question: 'Ahoj?', threadId: null, history: [] },
    });

    await stream.next();
    expect(await engine.services.ai.processQueued()).toEqual([]);
    let step = await stream.next();
    while (step.done !== true) {
      step = await stream.next();
    }

    expect(step.value).toMatchObject({ status: 'done', output: { references: [] } });
    expect(engine.claude.requests).toHaveLength(1);
  });

  it('drops the results of a worker whose claim was taken over while it ran', async () => {
    const engine = createTestEngine(MANUAL_AI);
    const threadId = await syncedThreadId(engine);
    const job = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'oneLiner', threadId },
    });
    engine.claude.respondWith(() => {
      engine.clock.advance(10 * 60_000);
      void engine.repositories.aiJobs.claim(job.id, {
        owner: 'other-worker',
        now: engine.clock.now().toISOString(),
        leaseUntil: new Date(engine.clock.now().getTime() + 600_000).toISOString(),
      });
      return [{ type: 'completed', output: { kind: 'oneLiner', text: 'Neskoro' } }];
    });

    const finished = await engine.services.ai.runJob(USER_ID, job.id);

    expect(finished).toMatchObject({ id: job.id, status: 'running', output: null });
    expect((await engine.repositories.threads.findById(USER_ID, threadId))?.aiOneLiner).toBeNull();
    expect(engine.db.tables.aiResults).toEqual([]);
  });

  it('creates one task even when a finished createTask job is recovered and run again', async () => {
    const engine = createTestEngine(MANUAL_AI);
    const threadId = await syncedThreadId(engine);
    engine.claude.respondWith(() => [
      {
        type: 'completed',
        output: { kind: 'createTask', threadId, title: 'Zaplatiť', aiWhat: 'Do piatku.' },
      },
    ]);
    const job = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'createTask', threadId, hint: null },
    });
    await engine.services.ai.runJob(USER_ID, job.id);
    const crashed = present(engine.db.tables.aiJobs.get(job.id));
    engine.db.tables.aiJobs.set(job.id, { ...crashed, status: 'running' });
    engine.db.tables.aiJobLeases.set(job.id, { owner: 'crashed', leaseUntil: TEST_NOW });
    engine.clock.advance(60_000);

    const [recovered] = await engine.services.ai.processQueued();

    expect(recovered?.status).toBe('done');
    const tasks = await engine.services.tasks.list(USER_ID, { limit: 50 });
    expect(tasks.items.map((task) => task.title)).toEqual(['Zaplatiť']);
  });

  it('never leaves a job done without its result when applying the result fails', async () => {
    const engine = createTestEngine(MANUAL_AI);
    const threadId = await syncedThreadId(engine);
    const job = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'createTask', threadId, hint: null },
    });
    engine.claude.respondWith(() => {
      engine.db.tables.threads.delete(threadId);
      return [
        {
          type: 'completed',
          output: { kind: 'createTask', threadId, title: 'Zaplatiť', aiWhat: 'Do piatku.' },
        },
      ];
    });

    const finished = await engine.services.ai.runJob(USER_ID, job.id);

    expect(finished.status).toBe('error');
    expect(finished.output).toBeNull();
    expect(engine.db.tables.aiResults).toEqual([]);
    expect((await engine.services.tasks.list(USER_ID, { limit: 50 })).items).toEqual([]);
    expect(engine.events.ofType('ai.job.updated').map((event) => event.data.job.status)).toEqual([
      'queued',
      'running',
      'error',
    ]);
  });
});
