import type { AiJob, MessageId, ThreadId, UserId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { PgAiJobRepository } from '../../src/persistence/repositories/ai-jobs/pg-ai-job-repository';
import { at, newId, seedAccount, seedThread } from './support/fixtures';
import { openInterceptedDatabase } from './support/intercepted-database';
import { usePgTestContext } from './support/pg-test-context';

const sourcedJob = (userId: UserId, threadId: ThreadId, source: MessageId): AiJob => ({
  id: newId('aiJob'),
  userId,
  kind: 'oneLiner',
  status: 'queued',
  runnerLocation: 'server',
  runner: 'claude',
  input: { kind: 'oneLiner', threadId, sourceMessageId: source },
  output: null,
  error: null,
  createdAt: at(0),
  updatedAt: at(0),
});

describe('PgAiJobRepository.enqueueIfAbsent race', () => {
  const context = usePgTestContext();

  it('retries the insert when the conflicting job finishes before it is looked up', async () => {
    const seeded = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);
    const source = newId('message');
    const { job: active } = await context.repositories.aiJobs.enqueueIfAbsent(
      sourcedJob(seeded.user.id, thread.id, source),
    );
    expect(active).not.toBeNull();
    const intercepted = openInterceptedDatabase(context.url, {
      matches: (text, result) => text.startsWith('insert into "ai_jobs"') && result.rowCount === 0,
      run: async () => {
        await context.repositories.aiJobs.update(active?.id ?? newId('aiJob'), {
          status: 'done',
          updatedAt: at(1),
        });
      },
    });
    const racing = new PgAiJobRepository(intercepted.db);

    const result = await racing.enqueueIfAbsent(sourcedJob(seeded.user.id, thread.id, source));
    await intercepted.close();

    expect(result).toMatchObject({ created: true, job: { status: 'queued' } });
    expect(result.job?.id).not.toBe(active?.id);
  });
});
