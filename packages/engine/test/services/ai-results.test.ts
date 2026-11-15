import type { ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID, OTHER_USER_ID } from '../support/test-engine';

const syncedThreadId = async (engine: TestEngine): Promise<ThreadId> => {
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', { id: 'm1', subject: 'Invoice 42', body: 'Please pay by Friday' });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  return present(page.items[0]).id;
};

const summarize = async (engine: TestEngine, threadId: ThreadId): Promise<void> => {
  engine.claude.respondWith(() => [
    {
      type: 'completed',
      output: {
        kind: 'summary',
        summary: 'Treba zaplatiť faktúru.',
        checklist: [
          { id: 'c1', text: 'Skontrolovať sumu', done: false },
          { id: 'c2', text: 'Zaplatiť', done: false },
        ],
      },
    },
  ]);
  const job = await engine.services.ai.createJob(USER_ID, {
    input: { kind: 'summary', threadId },
  });
  await engine.services.ai.runJob(USER_ID, job.id);
};

describe('AI results', () => {
  it('creates an AI task from a createTask job', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const threadId = await syncedThreadId(engine);
    engine.claude.respondWith(() => [
      {
        type: 'completed',
        output: {
          kind: 'createTask',
          threadId,
          title: 'Zaplatiť faktúru 42',
          aiWhat: 'Uhradiť do piatku.',
        },
      },
    ]);
    const job = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'createTask', threadId, hint: 'do piatku' },
    });

    const done = await engine.services.ai.runJob(USER_ID, job.id);

    expect(done.status).toBe('done');
    expect(engine.claude.requests[0]?.input).toEqual({
      kind: 'createTask',
      threadId,
      hint: 'do piatku',
    });
    const tasks = await engine.services.tasks.list(USER_ID, { limit: 50 });
    expect(tasks.items).toMatchObject([
      { threadId, title: 'Zaplatiť faktúru 42', aiWhat: 'Uhradiť do piatku.', source: 'ai' },
    ]);
    expect(engine.events.ofType('task.upserted')).toHaveLength(1);
  });

  it('persists checklist ticks in the latest summary', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const threadId = await syncedThreadId(engine);
    await summarize(engine, threadId);

    const response = await engine.services.checklist.update(USER_ID, threadId, {
      itemId: 'c2',
      done: true,
    });

    expect(response.checklist.map((item) => item.done)).toEqual([false, true]);
    const detail = await engine.services.threads.getDetail(USER_ID, threadId);
    expect(detail.checklist).toEqual(response.checklist);
    expect(detail.aiSummary).toBe('Treba zaplatiť faktúru.');
    await engine.services.checklist.update(USER_ID, threadId, { itemId: 'c2', done: false });
    expect((await engine.services.threads.getDetail(USER_ID, threadId)).checklist[1]?.done).toBe(
      false,
    );
  });

  it('rejects checklist ticks for unknown items, missing summaries and other users', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const threadId = await syncedThreadId(engine);
    await expect(
      engine.services.checklist.update(USER_ID, threadId, { itemId: 'c1', done: true }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await summarize(engine, threadId);

    await expect(
      engine.services.checklist.update(USER_ID, threadId, { itemId: 'nope', done: true }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      engine.services.checklist.update(OTHER_USER_ID, threadId, { itemId: 'c1', done: true }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
