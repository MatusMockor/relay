import {
  type AiEvent,
  DEFAULT_USER_SETTINGS,
  type DraftId,
  type ThreadId,
} from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, OTHER_USER_ID, type TestEngine, USER_ID } from '../support/test-engine';

const syncedThread = async (engine: TestEngine) => {
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', { id: 'm1', subject: 'Invoice 42', body: 'Please pay by Friday' });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  engine.events.clear();
  return present(page.items[0]);
};

const MANUAL_AI = { ai: { oneLinersPerSync: 0 } };

const jobStatuses = (engine: TestEngine): string[] =>
  engine.events.ofType('ai.job.updated').map((event) => event.data.job.status);

describe('AiService', () => {
  it('queues, runs and persists a one-liner onto the thread', async () => {
    const engine = createTestEngine(MANUAL_AI);
    const thread = await syncedThread(engine);
    engine.claude.respondWith(() => [
      { type: 'started', runner: 'claude' },
      { type: 'delta', text: 'Fakt' },
      { type: 'completed', output: { kind: 'oneLiner', text: 'Faktúra 42 na úhradu do piatku' } },
    ]);

    const job = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'oneLiner', threadId: thread.id },
    });
    expect(job).toMatchObject({ status: 'queued', runnerLocation: 'local', runner: 'claude' });

    const [processed] = await engine.services.ai.processQueued();

    expect(processed).toMatchObject({
      id: job.id,
      status: 'done',
      output: { kind: 'oneLiner', text: 'Faktúra 42 na úhradu do piatku' },
      error: null,
    });
    expect(jobStatuses(engine)).toEqual(['queued', 'running', 'done']);
    const request = present(engine.claude.requests[0]);
    expect(request).toMatchObject({
      jobId: job.id,
      userId: USER_ID,
      timeoutMs: 120_000,
      mailTools: null,
    });
    expect(request.thread?.messages.map((message) => message.textBody)).toEqual([
      'Please pay by Friday',
    ]);
    const stored = await engine.repositories.threads.findById(USER_ID, thread.id);
    expect(stored?.aiOneLiner).toBe('Faktúra 42 na úhradu do piatku');
    expect(engine.events.ofType('thread.upserted').at(-1)?.data.thread.aiOneLiner).toBe(
      'Faktúra 42 na úhradu do piatku',
    );
    expect(await engine.services.ai.processQueued()).toEqual([]);
    expect(await engine.services.ai.getJob(USER_ID, job.id)).toEqual(processed);
  });

  it('resolves mail tools for the claim owner, who holds the job only while it runs', async () => {
    const seen: { owner: string; held: boolean; reclaimed: boolean }[] = [];
    const engine: TestEngine = createTestEngine({
      ai: {
        oneLinersPerSync: 0,
        mailTools: async (job, owner) => {
          const held = await engine.services.ai.ownsJob(job.userId, job.id, owner);
          const reclaimed = await engine.services.ai.ownsJob(job.userId, job.id, `${owner}-old`);
          seen.push({ owner, held, reclaimed });
          return null;
        },
      },
    });
    const thread = await syncedThread(engine);
    engine.claude.respondWith(() => [
      { type: 'completed', output: { kind: 'oneLiner', text: 'Faktúra' } },
    ]);
    const job = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'oneLiner', threadId: thread.id },
    });

    await engine.services.ai.runJob(USER_ID, job.id);

    const [check] = seen;
    expect(check).toMatchObject({ held: true, reclaimed: false });
    await expect(engine.services.ai.ownsJob(USER_ID, job.id, present(check).owner)).resolves.toBe(
      false,
    );
  });

  it('stops owning a job whose lease ran out or that another worker claimed', async () => {
    const engine = createTestEngine(MANUAL_AI);
    const thread = await syncedThread(engine);
    const job = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'oneLiner', threadId: thread.id },
    });
    const now = engine.clock.now();
    const leaseUntil = new Date(now.getTime() + 60_000).toISOString();
    await engine.repositories.aiJobs.claim(job.id, {
      owner: 'first',
      now: now.toISOString(),
      leaseUntil,
    });
    await expect(engine.services.ai.ownsJob(USER_ID, job.id, 'first')).resolves.toBe(true);
    await expect(engine.services.ai.ownsJob(OTHER_USER_ID, job.id, 'first')).resolves.toBe(false);

    engine.clock.advance(61_000);
    await expect(engine.services.ai.ownsJob(USER_ID, job.id, 'first')).resolves.toBe(false);
    await engine.repositories.aiJobs.claim(job.id, {
      owner: 'second',
      now: engine.clock.now().toISOString(),
      leaseUntil: new Date(engine.clock.now().getTime() + 60_000).toISOString(),
    });
    await expect(engine.services.ai.ownsJob(USER_ID, job.id, 'first')).resolves.toBe(false);
    await expect(engine.services.ai.ownsJob(USER_ID, job.id, 'second')).resolves.toBe(true);
  });

  it('exposes summaries, checklists and reply suggestions in the thread detail', async () => {
    const engine = createTestEngine(MANUAL_AI);
    const thread = await syncedThread(engine);
    engine.claude.respondWith((request) =>
      request.input.kind === 'summary'
        ? [
            {
              type: 'completed',
              output: {
                kind: 'summary',
                summary: 'Treba zaplatiť faktúru.',
                checklist: [{ id: 'c1', text: 'Zaplatiť', done: false }],
              },
            },
          ]
        : [
            {
              type: 'completed',
              output: {
                kind: 'replySuggestions',
                suggestions: [{ id: 's1', label: 'Potvrdiť', body: 'Zaplatím v piatok.' }],
              },
            },
          ],
    );
    const summary = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'summary', threadId: thread.id },
    });
    const replies = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'replySuggestions', threadId: thread.id },
    });

    await engine.services.ai.runJob(USER_ID, summary.id);
    await engine.services.ai.runJob(USER_ID, replies.id);

    const detail = await engine.services.threads.getDetail(USER_ID, thread.id);
    expect(detail.aiSummary).toBe('Treba zaplatiť faktúru.');
    expect(detail.checklist).toEqual([{ id: 'c1', text: 'Zaplatiť', done: false }]);
    expect(detail.replySuggestions.map((suggestion) => suggestion.label)).toEqual(['Potvrdiť']);
    await expect(engine.services.ai.runJob(USER_ID, summary.id)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('records runner failures and mismatched output', async () => {
    const engine = createTestEngine(MANUAL_AI);
    const thread = await syncedThread(engine);
    engine.claude.respondWith(() => [
      { type: 'failed', code: 'timeout', message: 'took too long' },
    ]);
    const failed = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'oneLiner', threadId: thread.id },
    });
    expect(await engine.services.ai.runJob(USER_ID, failed.id)).toMatchObject({
      status: 'error',
      error: 'timeout: took too long',
      output: null,
    });

    engine.claude.respondWith(() => [
      { type: 'completed', output: { kind: 'rewrite', text: 'x' } },
    ]);
    const mismatched = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'summary', threadId: thread.id },
    });
    const result = await engine.services.ai.runJob(USER_ID, mismatched.id);
    expect(result.status).toBe('error');
    expect(result.error).toContain('invalid_output');
    expect((await engine.repositories.threads.findById(USER_ID, thread.id))?.aiOneLiner).toBeNull();
  });

  it('respects feature toggles and the configured runner location', async () => {
    const engine = createTestEngine(MANUAL_AI);
    const thread = await syncedThread(engine);
    await engine.repositories.settings.save(USER_ID, {
      ...DEFAULT_USER_SETTINGS,
      ai: {
        ...DEFAULT_USER_SETTINGS.ai,
        location: 'server',
        features: { ...DEFAULT_USER_SETTINGS.ai.features, oneLiners: false },
      },
    });

    await expect(
      engine.services.ai.createJob(USER_ID, { input: { kind: 'oneLiner', threadId: thread.id } }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const remote = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'summary', threadId: thread.id },
      runner: 'codex',
    });

    expect(remote).toMatchObject({ runnerLocation: 'server', runner: 'codex' });
    expect(await engine.services.ai.processQueued()).toEqual([]);
    await expect(engine.services.ai.runJob(USER_ID, remote.id)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('streams runner events for chat answers and falls back to an available runner', async () => {
    const engine = createTestEngine(MANUAL_AI);
    engine.claude.respondWith(() => [
      { type: 'started', runner: 'claude' },
      { type: 'delta', text: 'Ahoj' },
      {
        type: 'completed',
        output: { kind: 'chatAnswer', text: 'Ahoj, nemáš nové faktúry.', references: [] },
      },
    ]);

    const events: AiEvent[] = [];
    const stream = engine.services.ai.run(USER_ID, {
      input: { kind: 'chatAnswer', question: 'Mám nové faktúry?', threadId: null, history: [] },
      runner: 'codex',
    });
    let step = await stream.next();
    while (step.done !== true) {
      events.push(step.value);
      step = await stream.next();
    }

    expect(events.map((event) => event.type)).toEqual(['started', 'delta', 'completed']);
    expect(step.value).toMatchObject({ status: 'done', runnerLocation: 'local', runner: 'codex' });
    expect(engine.db.tables.aiResults.map((result) => [result.runner, result.threadId])).toEqual([
      ['claude', null],
    ]);
  });

  it('fails a streamed job that the consumer stops early', async () => {
    const engine = createTestEngine(MANUAL_AI);
    engine.claude.respondWith(() => [
      { type: 'started', runner: 'claude' },
      { type: 'delta', text: 'Ah' },
      { type: 'completed', output: { kind: 'chatAnswer', text: 'Ahoj', references: [] } },
    ]);
    const stream = engine.services.ai.run(USER_ID, {
      input: { kind: 'chatAnswer', question: 'Ahoj?', threadId: null, history: [] },
    });

    const received: AiEvent[] = [];
    for await (const event of stream) {
      received.push(event);
      break;
    }

    expect(received).toEqual([{ type: 'started', runner: 'claude' }]);
    const [job] = [...engine.db.tables.aiJobs.values()];
    expect(job).toMatchObject({
      status: 'error',
      error: 'cancelled: the run was stopped before it finished',
    });
    expect(engine.db.tables.aiResults).toEqual([]);
  });

  it('refuses to run the same job twice at the same time', async () => {
    const engine = createTestEngine(MANUAL_AI);
    const thread = await syncedThread(engine);
    engine.claude.respondWith(() => [
      { type: 'completed', output: { kind: 'oneLiner', text: 'Raz' } },
    ]);
    const job = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'oneLiner', threadId: thread.id },
    });

    const results = await Promise.allSettled([
      engine.services.ai.runJob(USER_ID, job.id),
      engine.services.ai.runJob(USER_ID, job.id),
    ]);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(engine.claude.requests).toHaveLength(1);
  });

  it('validates referenced threads and drafts', async () => {
    const engine = createTestEngine(MANUAL_AI);
    await expect(
      engine.services.ai.createJob(USER_ID, {
        input: { kind: 'summary', threadId: 'thread_missing' as ThreadId },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      engine.services.ai.createJob(USER_ID, {
        input: {
          kind: 'rewrite',
          text: 'ahoj',
          instruction: 'formálne',
          draftId: 'draft_x' as DraftId,
        },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await engine.services.ai.listRunners()).toEqual([
      expect.objectContaining({ runner: 'claude', installed: true }),
    ]);
  });
});
