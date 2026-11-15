import type { AiJob, ThreadId, UserId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { at, newId, seedAccount, seedThread } from '../persistence/support/fixtures';
import { usePgTestContext } from '../persistence/support/pg-test-context';

const buildJob = (userId: UserId, threadId: ThreadId): AiJob => ({
  id: newId('aiJob'),
  userId,
  kind: 'oneLiner',
  status: 'queued',
  runnerLocation: 'local',
  runner: 'claude',
  input: { kind: 'oneLiner', threadId },
  output: null,
  error: null,
  createdAt: at(0),
  updatedAt: at(0),
});

describe('PgAiJobRepository fencing for external workers', () => {
  const context = usePgTestContext();

  it('lists only the given user and never moves a finished job back to running', async () => {
    const account = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, account);
    const other = await seedAccount(context.repositories);
    const otherThread = await seedThread(context.repositories, other);
    const { aiJobs } = context.repositories;
    const mine = await aiJobs.create(buildJob(account.user.id, thread.id));
    await aiJobs.create(buildJob(other.user.id, otherThread.thread.id));

    const listed = await aiJobs.listQueued({
      location: 'local',
      userId: account.user.id,
      now: at(1),
      limit: 10,
    });
    expect(listed.map((job) => job.id)).toEqual([mine.id]);

    const owner = 'remote:dev_a:lease_1';
    await aiJobs.claim(mine.id, { owner, location: 'local', now: at(1), leaseUntil: at(5) });
    const done = await aiJobs.update(mine.id, {
      status: 'done',
      output: { kind: 'oneLiner', text: 'Hotovo' },
      updatedAt: at(2),
      owner,
      fromStatus: 'running',
    });
    expect(done?.status).toBe('done');

    const lateHeartbeat = await aiJobs.update(mine.id, {
      status: 'running',
      updatedAt: at(3),
      owner,
      leaseUntil: at(6),
      fromStatus: 'running',
    });
    expect(lateHeartbeat).toBeNull();
    expect((await aiJobs.findById(account.user.id, mine.id))?.status).toBe('done');
  });
});
