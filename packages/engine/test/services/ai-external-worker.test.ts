import type { ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../src';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import {
  createTestEngine,
  OTHER_USER_ID,
  TEST_NOW,
  type TestEngine,
  USER_ID,
} from '../support/test-engine';

const DEVICE = 'dev_laptop';

const serverEngine = async (): Promise<{ engine: TestEngine; threadId: ThreadId }> => {
  const engine = createTestEngine({ aiRunnerLocation: 'server', ai: { oneLinersPerSync: 0 } });
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', { id: 'm1', subject: 'Invoice 42', body: 'Please pay by Friday' });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  await engine.services.settings.update(USER_ID, { ai: { location: 'local' } });
  return { engine, threadId: present(page.items[0]).id };
};

const queueOneLiner = (engine: TestEngine, threadId: ThreadId) =>
  engine.services.ai.createJob(USER_ID, { input: { kind: 'oneLiner', threadId } });

describe('AI jobs run by an external worker', () => {
  it('claims a queued local job with its thread and applies the completed output', async () => {
    const { engine, threadId } = await serverEngine();
    const job = await queueOneLiner(engine, threadId);
    expect(job.runnerLocation).toBe('local');
    expect(await engine.services.ai.processQueued()).toEqual([]);

    const batch = await engine.services.ai.claimExternal(USER_ID, DEVICE, 5);

    expect(batch.location).toBe('local');
    const claim = present(batch.jobs[0]);
    expect(claim.job).toMatchObject({ id: job.id, status: 'running' });
    expect(claim.thread?.thread.id).toBe(threadId);
    expect(await engine.services.ai.claimExternal(USER_ID, DEVICE, 5)).toEqual({
      location: 'local',
      jobs: [],
    });

    engine.events.clear();
    const done = await engine.services.ai.completeExternal(
      USER_ID,
      job.id,
      { workerId: DEVICE, leaseId: claim.leaseId },
      { runner: 'codex', output: { kind: 'oneLiner', text: 'Faktúra na úhradu' } },
    );

    expect(done).toMatchObject({ status: 'done', output: { text: 'Faktúra na úhradu' } });
    expect((await engine.repositories.threads.findById(USER_ID, threadId))?.aiOneLiner).toBe(
      'Faktúra na úhradu',
    );
    expect(engine.events.ofType('thread.upserted')).toHaveLength(1);
    expect(engine.events.ofType('ai.job.updated').map((event) => event.data.job.status)).toEqual([
      'done',
    ]);
    expect(
      (await engine.repositories.aiResults.findLatest(USER_ID, threadId, 'oneLiner'))?.runner,
    ).toBe('codex');
  });

  it('rejects another worker, another user and a finished job', async () => {
    const { engine, threadId } = await serverEngine();
    const job = await queueOneLiner(engine, threadId);
    const claim = present((await engine.services.ai.claimExternal(USER_ID, DEVICE, 1)).jobs[0]);
    const output = { kind: 'oneLiner' as const, text: 'Nie' };

    await expect(
      engine.services.ai.completeExternal(
        USER_ID,
        job.id,
        { workerId: 'dev_other', leaseId: claim.leaseId },
        { runner: 'claude', output },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      engine.services.ai.heartbeatExternal(OTHER_USER_ID, job.id, {
        workerId: DEVICE,
        leaseId: claim.leaseId,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      engine.services.ai.completeExternal(
        USER_ID,
        job.id,
        { workerId: DEVICE, leaseId: claim.leaseId },
        { runner: 'claude', output: { kind: 'rewrite', text: 'Iný druh' } },
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const failed = await engine.services.ai.failExternal(
      USER_ID,
      job.id,
      { workerId: DEVICE, leaseId: claim.leaseId },
      { code: 'not_installed', message: 'claude is missing' },
    );
    expect(failed).toMatchObject({ status: 'error', error: 'not_installed: claude is missing' });
    await expect(
      engine.services.ai.heartbeatExternal(USER_ID, job.id, {
        workerId: DEVICE,
        leaseId: claim.leaseId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('lets another worker reclaim a job whose lease expired and fences the old one', async () => {
    const { engine, threadId } = await serverEngine();
    const job = await queueOneLiner(engine, threadId);
    const first = present((await engine.services.ai.claimExternal(USER_ID, DEVICE, 1)).jobs[0]);
    const renewed = await engine.services.ai.heartbeatExternal(USER_ID, job.id, {
      workerId: DEVICE,
      leaseId: first.leaseId,
    });
    expect(Date.parse(renewed.leaseUntil)).toBeGreaterThan(Date.parse(TEST_NOW));

    engine.clock.set(new Date(Date.parse(TEST_NOW) + 60_000).toISOString());
    expect((await engine.services.ai.claimExternal(USER_ID, 'dev_desk', 1)).jobs).toEqual([]);

    engine.clock.set(new Date(Date.parse(TEST_NOW) + 200_000).toISOString());
    const second = present(
      (await engine.services.ai.claimExternal(USER_ID, 'dev_desk', 1)).jobs[0],
    );
    expect(second.job.id).toBe(job.id);

    await expect(
      engine.services.ai.completeExternal(
        USER_ID,
        job.id,
        { workerId: DEVICE, leaseId: first.leaseId },
        { runner: 'claude', output: { kind: 'oneLiner', text: 'Starý' } },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    const done = await engine.services.ai.completeExternal(
      USER_ID,
      job.id,
      { workerId: 'dev_desk', leaseId: second.leaseId },
      { runner: 'claude', output: { kind: 'oneLiner', text: 'Nový' } },
    );
    expect(done.output).toEqual({ kind: 'oneLiner', text: 'Nový' });
  });

  it('applies the output only once when the same lease completes twice at the same time', async () => {
    const { engine, threadId } = await serverEngine();
    const job = await queueOneLiner(engine, threadId);
    const claim = present((await engine.services.ai.claimExternal(USER_ID, DEVICE, 1)).jobs[0]);
    const lease = { workerId: DEVICE, leaseId: claim.leaseId };

    const outcomes = await Promise.allSettled([
      engine.services.ai.completeExternal(USER_ID, job.id, lease, {
        runner: 'claude',
        output: { kind: 'oneLiner', text: 'Prvý' },
      }),
      engine.services.ai.completeExternal(USER_ID, job.id, lease, {
        runner: 'claude',
        output: { kind: 'oneLiner', text: 'Druhý' },
      }),
    ]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(
      engine.db.tables.aiResults.filter((result) => result.threadId === threadId),
    ).toHaveLength(1);
    const stored = await engine.services.ai.getJob(USER_ID, job.id);
    expect((await engine.repositories.threads.findById(USER_ID, threadId))?.aiOneLiner).toBe(
      stored.output?.kind === 'oneLiner' ? stored.output.text : null,
    );
  });

  it('settles the job as an error and keeps no result when applying the output fails', async () => {
    const { engine, threadId } = await serverEngine();
    const job = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'createTask', threadId, hint: null },
    });
    const claim = present((await engine.services.ai.claimExternal(USER_ID, DEVICE, 1)).jobs[0]);
    await engine.repositories.threads.delete(threadId);
    engine.events.clear();

    await expect(
      engine.services.ai.completeExternal(
        USER_ID,
        job.id,
        { workerId: DEVICE, leaseId: claim.leaseId },
        {
          runner: 'claude',
          output: {
            kind: 'createTask',
            threadId,
            title: 'Zaplatiť',
            aiWhat: 'Do piatku.',
            priority: 'none',
          },
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await engine.services.ai.getJob(USER_ID, job.id)).toMatchObject({
      status: 'error',
      output: null,
    });
    expect(engine.db.tables.aiResults).toEqual([]);
    expect(engine.db.tables.tasks.size).toBe(0);
    expect(engine.events.ofType('ai.job.updated').map((event) => event.data.job.status)).toEqual([
      'error',
    ]);
  });

  it('claims nothing while the user runs AI on the server or for other users', async () => {
    const { engine, threadId } = await serverEngine();
    await queueOneLiner(engine, threadId);

    expect((await engine.services.ai.claimExternal(OTHER_USER_ID, DEVICE, 5)).jobs).toEqual([]);
    await engine.services.settings.update(USER_ID, { ai: { location: 'server' } });
    expect(await engine.services.ai.claimExternal(USER_ID, DEVICE, 5)).toEqual({
      location: 'server',
      jobs: [],
    });
  });
});
