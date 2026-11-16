import type { AiEvent, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import type { AiRequest } from '../../src';
import { StubAiRunner } from '../support/fakes/stub-ai-runner';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const LEASE_MS = 180_000;
const RENEWAL_MS = 45_000;

class PausingAiRunner extends StubAiRunner {
  constructor(private readonly during: (request: AiRequest) => Promise<void>) {
    super('claude', () => []);
  }

  override async *run(request: AiRequest): AsyncIterable<AiEvent> {
    this.requests.push(request);
    yield { type: 'started', runner: 'claude' };
    if (this.requests.length === 1) {
      await this.during(request);
    }
    if (request.signal?.aborted === true) {
      yield { type: 'failed', code: 'cancelled', message: 'the run was aborted' };
      return;
    }
    yield { type: 'completed', output: { kind: 'oneLiner', text: 'Hotovo' } };
  }
}

const syncedThreadId = async (engine: TestEngine): Promise<ThreadId> => {
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', { id: 'm1', subject: 'Invoice 42', body: 'Please pay by Friday' });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  return present(page.items[0]).id;
};

const queuedOneLiner = async (engine: TestEngine) =>
  engine.services.ai.createJob(USER_ID, {
    input: { kind: 'oneLiner', threadId: await syncedThreadId(engine) },
  });

describe('AI job lease renewal', () => {
  it('renews the lease while the runner works so no other worker reclaims the job', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const job = await queuedOneLiner(engine);
    const during: { intervals: number[]; reclaimed: unknown } = { intervals: [], reclaimed: null };
    const runner = new PausingAiRunner(async () => {
      during.intervals = engine.timer.intervals;
      engine.clock.advance(LEASE_MS - 30_000);
      await engine.timer.fire();
      engine.clock.advance(LEASE_MS - 30_000);
      during.reclaimed = await engine.services.ai.processQueued();
    });
    engine.runners.register(runner);

    const finished = await engine.services.ai.runJob(USER_ID, job.id);

    expect(during.intervals).toEqual([RENEWAL_MS]);
    expect(during.reclaimed).toEqual([]);
    expect(finished).toMatchObject({ id: job.id, status: 'done' });
    expect(runner.requests).toHaveLength(1);
    expect(engine.timer.intervals).toEqual([]);
  });

  it('aborts the runner when the heartbeat finds the lease taken over', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const job = await queuedOneLiner(engine);
    const during = { taken: false, aborted: false };
    engine.runners.register(
      new PausingAiRunner(async (request) => {
        engine.clock.advance(LEASE_MS + 1_000);
        const now = engine.clock.now();
        const claimed = await engine.repositories.aiJobs.claim(job.id, {
          owner: 'other-worker',
          now: now.toISOString(),
          leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString(),
        });
        during.taken = claimed !== null;
        await engine.timer.fire();
        during.aborted = request.signal?.aborted === true;
      }),
    );

    const finished = await engine.services.ai.runJob(USER_ID, job.id);

    expect(during).toEqual({ taken: true, aborted: true });
    expect(finished).toMatchObject({ id: job.id, status: 'running', output: null });
    expect(engine.db.tables.aiJobLeases.get(job.id)?.owner).toBe('other-worker');
    expect(engine.logger.entries.some((entry) => entry.message.includes('lease was lost'))).toBe(
      true,
    );
  });
});
