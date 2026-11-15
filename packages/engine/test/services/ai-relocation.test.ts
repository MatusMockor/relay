import type { AiJob, AiJobId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, TEST_NOW, type TestEngine, USER_ID } from '../support/test-engine';

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
  runnerLocation: 'server',
  runner: 'claude',
  input: { kind: 'oneLiner', threadId },
  output: null,
  error: null,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  ...overrides,
});

const answer = (engine: TestEngine): void => {
  engine.claude.respondWith(() => [
    { type: 'completed', output: { kind: 'oneLiner', text: 'Faktúra na úhradu' } },
  ]);
};

describe('relocating queued AI jobs', () => {
  it('moves queued jobs to the new location when the user switches it', async () => {
    const engine = createTestEngine({ aiRunnerLocation: 'server', ai: { oneLinersPerSync: 0 } });
    const threadId = await syncedThreadId(engine);
    answer(engine);
    const queued = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'oneLiner', threadId },
    });
    await engine.repositories.aiJobs.create(
      storedJob(threadId, 'job_done', { runnerLocation: 'local', status: 'done' }),
    );
    expect(queued.runnerLocation).toBe('local');
    expect(await engine.services.ai.processQueued()).toEqual([]);
    engine.events.clear();

    await engine.services.settings.update(USER_ID, { ai: { location: 'server' } });

    const relocated = await engine.services.ai.getJob(USER_ID, queued.id);
    expect(relocated).toMatchObject({ status: 'queued', runnerLocation: 'server' });
    expect(engine.events.ofType('ai.job.updated').map((entry) => entry.data.job.id)).toEqual([
      queued.id,
    ]);
    const untouched = await engine.services.ai.getJob(USER_ID, 'job_done' as AiJobId);
    expect(untouched.runnerLocation).toBe('local');
    const processed = await engine.services.ai.processQueued();
    expect(processed.map((job) => [job.id, job.status])).toEqual([[queued.id, 'done']]);
  });

  it('adopts jobs queued for another location when the location is pinned', async () => {
    const engine = createTestEngine({
      settings: { pinnedAiLocation: 'local' },
      ai: { oneLinersPerSync: 0 },
    });
    const threadId = await syncedThreadId(engine);
    answer(engine);
    await engine.repositories.aiJobs.create(storedJob(threadId, 'job_stuck'));

    expect(await engine.services.ai.relocateQueued(USER_ID)).toBe(1);

    const processed = await engine.services.ai.processQueued();
    expect(processed.map((job) => [job.id, job.status])).toEqual([['job_stuck', 'done']]);
    const created = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'oneLiner', threadId },
    });
    expect(created.runnerLocation).toBe('local');
  });

  it('refuses to run a relocated job on the old runner', async () => {
    const engine = createTestEngine({ aiRunnerLocation: 'server', ai: { oneLinersPerSync: 0 } });
    const threadId = await syncedThreadId(engine);
    answer(engine);
    await engine.services.settings.update(USER_ID, { ai: { location: 'server' } });
    const job = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'oneLiner', threadId },
    });
    const listed = await engine.repositories.aiJobs.listQueued({
      location: 'server',
      now: TEST_NOW,
      limit: 10,
    });
    expect(listed.map((entry) => entry.id)).toEqual([job.id]);

    await engine.services.settings.update(USER_ID, { ai: { location: 'local' } });

    await expect(engine.services.ai.runJob(USER_ID, job.id)).rejects.toThrow();
    expect(await engine.services.ai.getJob(USER_ID, job.id)).toMatchObject({
      status: 'queued',
      runnerLocation: 'local',
    });
  });
});
