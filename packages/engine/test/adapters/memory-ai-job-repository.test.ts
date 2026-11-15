import type { AiJob, AiJobId, MessageId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { createTestEngine, TEST_NOW, USER_ID } from '../support/test-engine';

const summaryJob = (id: string): AiJob => ({
  id: id as AiJobId,
  userId: USER_ID,
  kind: 'summary',
  status: 'queued',
  runnerLocation: 'local',
  runner: 'claude',
  input: {
    kind: 'summary',
    threadId: 'thread_1' as ThreadId,
    sourceMessageId: 'message_1' as MessageId,
  },
  output: null,
  error: null,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
});

const CLAIM = { owner: 'worker_1', now: TEST_NOW, leaseUntil: '2026-11-15T10:05:00.000Z' };

describe('MemoryAiJobRepository rollback', () => {
  it('drops the claimed-on-create marker when the unit of work rolls back', async () => {
    const engine = createTestEngine();
    const job = summaryJob('job_1');

    await expect(
      engine.unitOfWork.run(async (repositories) => {
        await repositories.aiJobs.create(job, CLAIM);
        return Promise.reject(new Error('rolled back'));
      }),
    ).rejects.toThrow('rolled back');
    await engine.repositories.aiJobs.create(job);
    const result = await engine.repositories.aiJobs.enqueueIfAbsent(summaryJob('job_2'));

    expect(result).toEqual({ job, created: false });
    expect(await engine.repositories.aiJobs.findById(USER_ID, 'job_2' as AiJobId)).toBeNull();
  });
});
