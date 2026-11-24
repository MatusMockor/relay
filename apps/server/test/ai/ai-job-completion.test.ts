import {
  AiJobCompleter,
  AiResultApplier,
  AiTaskBuilder,
  EngineEvents,
  type EventPublisher,
} from '@relay/engine';
import type { AiJob, AiOutput, UserId } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import { describe, expect, it } from 'vitest';
import { RandomIdGenerator } from '../../src/infrastructure/random-id-generator';
import { openPostgresConnection } from '../../src/persistence/database/postgres-connection';
import { PgUnitOfWork } from '../../src/persistence/unit-of-work/pg-unit-of-work';
import { at, newId, seedAccount, seedThread } from '../persistence/support/fixtures';
import { usePgTestContext } from '../persistence/support/pg-test-context';
import { ManualClock } from '../support/manual-clock';

const OWNER = 'remote:dev_a:lease_1';

class RecordingPublisher implements EventPublisher {
  readonly published: RealtimeEvent[] = [];

  publish(_userId: UserId, event: RealtimeEvent): Promise<void> {
    this.published.push(event);
    return Promise.resolve();
  }
}

const buildJob = (userId: UserId, input: AiJob['input']): AiJob => ({
  id: newId('aiJob'),
  userId,
  kind: input.kind,
  status: 'queued',
  runnerLocation: 'local',
  runner: 'claude',
  input,
  output: null,
  error: null,
  createdAt: at(0),
  updatedAt: at(0),
});

describe('completing an AI job in one transaction (Postgres)', () => {
  const context = usePgTestContext();

  const setup = () => {
    const clock = new ManualClock(new Date(at(1)));
    const ids = new RandomIdGenerator();
    const publisher = new RecordingPublisher();
    const events = new EngineEvents(publisher, clock);
    const completer = new AiJobCompleter({
      unitOfWork: new PgUnitOfWork(context.db),
      results: new AiResultApplier({ events, tasks: new AiTaskBuilder(clock, ids), clock, ids }),
      events,
      clock,
    });
    return { completer, publisher };
  };

  const claimed = async (userId: UserId, input: AiJob['input']): Promise<AiJob> => {
    const { aiJobs } = context.repositories;
    const job = await aiJobs.create(buildJob(userId, input));
    const running = await aiJobs.claim(job.id, {
      owner: OWNER,
      location: 'local',
      now: at(1),
      leaseUntil: at(3),
    });
    expect(running?.status).toBe('running');
    return running ?? job;
  };

  const complete = (job: AiJob, output: AiOutput) =>
    setup().completer.complete({ job, owner: OWNER, runner: 'codex', output });

  it('stores the done status, the result and the task together and publishes after commit', async () => {
    const account = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, account);
    const userId = account.user.id;
    const job = await claimed(userId, { kind: 'createTask', threadId: thread.id, hint: null });
    const { completer, publisher } = setup();

    const done = await completer.complete({
      job,
      owner: OWNER,
      runner: 'codex',
      output: {
        kind: 'createTask',
        threadId: thread.id,
        title: 'Zaplatiť',
        aiWhat: 'Faktúra',
        priority: 'high',
      },
    });

    expect(done?.status).toBe('done');
    const tasks = await context.repositories.tasks.list(userId, {
      state: null,
      cursor: null,
      limit: 10,
    });
    expect(tasks.items.map((task) => task.id)).toEqual([`task_${job.id}`]);
    expect(tasks.items[0]?.priority).toBe('high');
    expect(
      await context.repositories.aiResults.findLatest(userId, thread.id, 'createTask'),
    ).toEqual(expect.objectContaining({ runner: 'codex' }));
    expect(publisher.published.map((event) => event.type)).toEqual([
      'task.upserted',
      'ai.job.updated',
    ]);
  });

  it('rolls the done status back when persisting the result fails', async () => {
    const account = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, account);
    const userId = account.user.id;
    const job = await claimed(userId, { kind: 'createTask', threadId: thread.id, hint: null });
    await context.repositories.threads.delete(thread.id);

    await expect(
      complete(job, {
        kind: 'createTask',
        threadId: thread.id,
        title: 'Zaplatiť',
        aiWhat: 'Faktúra',
        priority: 'none',
      }),
    ).rejects.toThrow();

    const stored = await context.repositories.aiJobs.findById(userId, job.id);
    expect(stored).toMatchObject({ status: 'running', output: null });
    expect(await context.repositories.aiResults.findLatest(userId, thread.id, 'createTask')).toBe(
      null,
    );
    const tasks = await context.repositories.tasks.list(userId, {
      state: null,
      cursor: null,
      limit: 10,
    });
    expect(tasks.items).toEqual([]);
    const reclaimed = await context.repositories.aiJobs.claim(job.id, {
      owner: 'remote:dev_b:lease_2',
      location: 'local',
      now: at(4),
      leaseUntil: at(6),
    });
    expect(reclaimed?.status).toBe('running');
  });

  it('rolls back when the result row itself cannot be stored', async () => {
    const account = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, account);
    const userId = account.user.id;
    const job = await claimed(userId, { kind: 'oneLiner', threadId: thread.id });
    await context.repositories.threads.delete(thread.id);

    await expect(complete(job, { kind: 'oneLiner', text: 'Faktúra' })).rejects.toThrow();

    expect((await context.repositories.aiJobs.findById(userId, job.id))?.status).toBe('running');
    expect(
      await context.repositories.aiResults.findLatest(userId, thread.id, 'oneLiner'),
    ).toBeNull();
  });

  it('does nothing for a lease that no longer holds the job', async () => {
    const account = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, account);
    const userId = account.user.id;
    const job = await claimed(userId, { kind: 'oneLiner', threadId: thread.id });
    const { completer, publisher } = setup();

    const outcome = await completer.complete({
      job,
      owner: 'remote:dev_other:lease_9',
      runner: 'claude',
      output: { kind: 'oneLiner', text: 'Cudzí' },
    });

    expect(outcome).toBeNull();
    expect(
      await context.repositories.aiResults.findLatest(userId, thread.id, 'oneLiner'),
    ).toBeNull();
    expect(publisher.published).toEqual([]);
  });

  it('keeps the newer result when an older and a newer job complete concurrently', async () => {
    const account = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, account);
    const userId = account.user.id;
    const connections = Array.from({ length: 2 }, () =>
      openPostgresConnection({ url: context.url, maxConnections: 1 }),
    );
    const completerOn = (connection: (typeof connections)[number]) => {
      const clock = new ManualClock(new Date(at(30)));
      const ids = new RandomIdGenerator();
      const events = new EngineEvents(new RecordingPublisher(), clock);
      return new AiJobCompleter({
        unitOfWork: new PgUnitOfWork(connection.db),
        results: new AiResultApplier({ events, tasks: new AiTaskBuilder(clock, ids), clock, ids }),
        events,
        clock,
      });
    };
    try {
      const [first, second] = connections.map(completerOn);
      for (const round of [1, 2, 3, 4, 5]) {
        const older = await claimed(userId, {
          kind: 'oneLiner',
          threadId: thread.id,
          sourceMessageId: newId('message'),
        });
        const newer = await context.repositories.aiJobs.create({
          ...buildJob(userId, {
            kind: 'oneLiner',
            threadId: thread.id,
            sourceMessageId: newId('message'),
          }),
          createdAt: at(round),
        });
        const running = await context.repositories.aiJobs.claim(newer.id, {
          owner: OWNER,
          location: 'local',
          now: at(round),
          leaseUntil: at(round + 10),
        });
        expect(running?.status).toBe('running');

        await Promise.all([
          first?.complete({
            job: older,
            owner: OWNER,
            runner: 'claude',
            output: { kind: 'oneLiner', text: `Staré ${String(round)}` },
          }),
          second?.complete({
            job: running ?? newer,
            owner: OWNER,
            runner: 'claude',
            output: { kind: 'oneLiner', text: `Nové ${String(round)}` },
          }),
        ]);

        expect((await context.repositories.threads.findById(userId, thread.id))?.aiOneLiner).toBe(
          `Nové ${String(round)}`,
        );
        expect(
          (await context.repositories.aiResults.findLatest(userId, thread.id, 'oneLiner'))?.output,
        ).toEqual({ kind: 'oneLiner', text: `Nové ${String(round)}` });
      }
    } finally {
      await Promise.all(connections.map((connection) => connection.close()));
    }
  });
});
