import type { AiJob, AiTaskKind, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src';
import { deliverMail, ME, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const jobsOf = (engine: TestEngine, kind: AiTaskKind): AiJob[] =>
  [...engine.db.tables.aiJobs.values()].filter((job) => job.kind === kind);

const inboxThread = async (engine: TestEngine, subject: string): Promise<ThreadId> => {
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  return present(page.items.find((thread) => thread.subject === subject)).id;
};

const answerAll = (engine: TestEngine): void => {
  engine.claude.respondWith((request) => {
    if (request.input.kind === 'summary') {
      return [
        {
          type: 'completed',
          output: {
            kind: 'summary',
            summary: 'Peter chce potvrdiť termín.',
            checklist: [{ id: 'check-1', text: 'Potvrdiť termín', done: false }],
          },
        },
      ];
    }
    return [
      {
        type: 'completed',
        output: {
          kind: 'replySuggestions',
          suggestions: [
            { id: 'reply-1', label: 'Potvrdiť', body: 'Termín sedí.' },
            { id: 'reply-2', label: 'Presunúť', body: 'Môžeme to posunúť?' },
            { id: 'reply-3', label: 'Odmietnuť', body: 'Tento týždeň nemôžem.' },
          ],
        },
      },
    ];
  });
};

describe('preparing thread AI on open', () => {
  it('queues the summary and reply suggestions once per latest message', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    answerAll(engine);
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'p1', subject: 'Termín' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const threadId = await inboxThread(engine, 'Termín');

    expect(await engine.services.threadAi.prepare(USER_ID, threadId)).toMatchObject({
      pending: ['summary', 'replySuggestions'],
    });
    expect(await engine.services.threadAi.prepare(USER_ID, threadId)).toMatchObject({
      pending: ['summary', 'replySuggestions'],
    });
    expect(jobsOf(engine, 'summary')).toHaveLength(1);
    expect(jobsOf(engine, 'replySuggestions')).toHaveLength(1);
    expect(engine.events.ofType('ai.job.updated').length).toBeGreaterThan(0);

    await engine.services.ai.processQueued();
    const detail = await engine.services.threads.getDetail(USER_ID, threadId);
    expect(detail.aiSummary).toBe('Peter chce potvrdiť termín.');
    expect(detail.checklist).toHaveLength(1);
    expect(detail.replySuggestions.map((suggestion) => suggestion.label)).toEqual([
      'Potvrdiť',
      'Presunúť',
      'Odmietnuť',
    ]);
    expect(await engine.services.threadAi.prepare(USER_ID, threadId)).toMatchObject({
      pending: [],
    });
    expect(jobsOf(engine, 'summary')).toHaveLength(1);

    engine.clock.advance(60 * 60_000);
    deliverMail(server, 'INBOX', {
      id: 'p2',
      subject: 'Re: Termín',
      inReplyTo: 'p1',
      date: '2026-11-15T10:30:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await engine.services.threadAi.prepare(USER_ID, threadId)).toMatchObject({
      pending: ['summary', 'replySuggestions'],
    });
    expect(jobsOf(engine, 'summary')).toHaveLength(2);
  });

  it('does not queue a second job while the first one is running', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'r1', subject: 'Beží' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const threadId = await inboxThread(engine, 'Beží');
    await engine.services.threadAi.prepare(USER_ID, threadId);
    const queued = present(jobsOf(engine, 'summary')[0]);
    const now = engine.clock.now();
    const claimed = await engine.repositories.aiJobs.claim(queued.id, {
      owner: 'other-worker',
      now: now.toISOString(),
      leaseUntil: new Date(now.getTime() + 60_000).toISOString(),
    });
    expect(claimed?.status).toBe('running');

    const state = await engine.services.threadAi.prepare(USER_ID, threadId);
    expect(state.pending).toEqual(['summary', 'replySuggestions']);
    expect(state.jobs).toContainEqual({ kind: 'summary', jobId: queued.id });
    expect(jobsOf(engine, 'summary')).toHaveLength(1);
  });

  it('carries the device time zone into the prepared jobs', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'z1', subject: 'Zóna' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const threadId = await inboxThread(engine, 'Zóna');

    await engine.services.threadAi.prepare(USER_ID, threadId, 'Europe/Bratislava');

    expect(present(jobsOf(engine, 'summary')[0]).input).toMatchObject({
      timeZone: 'Europe/Bratislava',
    });
    expect(present(jobsOf(engine, 'replySuggestions')[0]).input).toMatchObject({
      timeZone: 'Europe/Bratislava',
    });
  });

  it('queues one job per kind when the thread is opened twice at the same time', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'c1', subject: 'Súbežne' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const threadId = await inboxThread(engine, 'Súbežne');

    const states = await Promise.all([
      engine.services.threadAi.prepare(USER_ID, threadId),
      engine.services.threadAi.prepare(USER_ID, threadId),
      engine.services.threadAi.prepare(USER_ID, threadId),
    ]);

    expect(states.map((state) => state.pending)).toEqual([
      ['summary', 'replySuggestions'],
      ['summary', 'replySuggestions'],
      ['summary', 'replySuggestions'],
    ]);
    expect(jobsOf(engine, 'summary')).toHaveLength(1);
    expect(jobsOf(engine, 'replySuggestions')).toHaveLength(1);
  });

  it('treats a result as stale when a newer message arrived while its job ran', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    answerAll(engine);
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 's1', subject: 'Zdroj', date: '2026-11-15T08:00:00.000Z' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const threadId = await inboxThread(engine, 'Zdroj');
    await engine.services.threadAi.prepare(USER_ID, threadId);
    const [first] = jobsOf(engine, 'summary');
    const firstSource = first?.input.kind === 'summary' ? first.input.sourceMessageId : null;
    expect(firstSource).not.toBeNull();

    deliverMail(server, 'INBOX', {
      id: 's2',
      subject: 'Re: Zdroj',
      inReplyTo: 's1',
      date: '2026-11-15T09:00:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    await engine.services.ai.processQueued();
    const result = present(
      await engine.repositories.aiResults.findLatest(USER_ID, threadId, 'summary'),
    );
    expect(result.sourceMessageId).toBe(firstSource);
    expect(Date.parse(result.createdAt)).toBeGreaterThan(Date.parse('2026-11-15T09:00:00.000Z'));

    expect(await engine.services.threadAi.prepare(USER_ID, threadId)).toMatchObject({
      pending: ['summary', 'replySuggestions'],
    });
    const sources = jobsOf(engine, 'summary').map((job) =>
      job.input.kind === 'summary' ? job.input.sourceMessageId : null,
    );
    expect(sources).toHaveLength(2);
    expect(sources[1]).not.toBe(firstSource);

    await engine.services.ai.processQueued();
    expect(await engine.services.threadAi.prepare(USER_ID, threadId)).toMatchObject({
      pending: [],
    });
  });

  it('joins an explicit job to the prepared one and still streams an interactive run', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    answerAll(engine);
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'j1', subject: 'Spolu' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const threadId = await inboxThread(engine, 'Spolu');
    const prepared = await engine.services.threadAi.prepare(USER_ID, threadId);

    const explicit = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'summary', threadId },
    });
    const streamed = engine.services.ai.run(USER_ID, { input: { kind: 'summary', threadId } });
    let step = await streamed.next();
    while (step.done !== true) {
      step = await streamed.next();
    }

    expect(prepared.jobs).toContainEqual({ kind: 'summary', jobId: explicit.id });
    expect(step.value.status).toBe('done');
    expect(jobsOf(engine, 'summary')).toHaveLength(2);
    const streamedResult = await engine.repositories.aiResults.findLatest(
      USER_ID,
      threadId,
      'summary',
    );
    expect(streamedResult?.sourceMessageId).not.toBeNull();
    expect(streamedResult?.sourceMessageId).toBe(
      step.value.input.kind === 'summary' ? step.value.input.sourceMessageId : undefined,
    );
  });

  it('never lets an older job replace the result of a newer one', async () => {
    const engine = createTestEngine({ aiRunnerLocation: 'server', ai: { oneLinersPerSync: 0 } });
    const { account, server } = await seedAccount(engine);
    await engine.services.settings.update(USER_ID, {
      ai: { location: 'local', features: { replySuggestions: false } },
    });
    deliverMail(server, 'INBOX', {
      id: 'o1',
      subject: 'Poradie',
      date: '2026-11-15T08:00:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const threadId = await inboxThread(engine, 'Poradie');
    await engine.services.threadAi.prepare(USER_ID, threadId);
    const slow = present((await engine.services.ai.claimExternal(USER_ID, 'dev_slow', 1)).jobs[0]);

    engine.clock.advance(60_000);
    deliverMail(server, 'INBOX', {
      id: 'o2',
      subject: 'Re: Poradie',
      inReplyTo: 'o1',
      date: '2026-11-15T09:00:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    await engine.services.threadAi.prepare(USER_ID, threadId);
    const fast = present((await engine.services.ai.claimExternal(USER_ID, 'dev_fast', 1)).jobs[0]);
    expect(fast.job.id).not.toBe(slow.job.id);

    await engine.services.ai.completeExternal(
      USER_ID,
      fast.job.id,
      { workerId: 'dev_fast', leaseId: fast.leaseId },
      { runner: 'claude', output: { kind: 'summary', summary: 'Novšie zhrnutie.', checklist: [] } },
    );
    engine.clock.advance(60_000);
    const late = await engine.services.ai.completeExternal(
      USER_ID,
      slow.job.id,
      { workerId: 'dev_slow', leaseId: slow.leaseId },
      {
        runner: 'claude',
        output: { kind: 'summary', summary: 'Staršie zhrnutie.', checklist: [] },
      },
    );

    expect(late.status).toBe('done');
    expect((await engine.services.threads.getDetail(USER_ID, threadId)).aiSummary).toBe(
      'Novšie zhrnutie.',
    );
    expect(await engine.services.threadAi.prepare(USER_ID, threadId)).toMatchObject({
      pending: [],
    });
  });

  it('skips reply suggestions for Jira threads and for own last messages', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', {
      id: 'j1',
      subject: '[CMS-217] Editor stráca obrázky',
      from: { name: 'Jira', email: 'jira@firma.test' },
    });
    deliverMail(server, 'INBOX', { id: 'o1', subject: 'Moja poznámka', from: ME });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const jira = await inboxThread(engine, '[CMS-217] Editor stráca obrázky');
    const own = await inboxThread(engine, 'Moja poznámka');

    expect(await engine.services.threadAi.prepare(USER_ID, jira)).toMatchObject({
      pending: ['summary'],
    });
    expect(await engine.services.threadAi.prepare(USER_ID, own)).toMatchObject({
      pending: ['summary'],
    });
    expect(jobsOf(engine, 'replySuggestions')).toHaveLength(0);
  });

  it('respects turned off features and unknown threads', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'f1', subject: 'Vypnuté' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const threadId = await inboxThread(engine, 'Vypnuté');
    await engine.services.settings.update(USER_ID, {
      ai: { features: { summaries: false, replySuggestions: false } },
    });

    expect(await engine.services.threadAi.prepare(USER_ID, threadId)).toMatchObject({
      pending: [],
    });
    expect(engine.db.tables.aiJobs.size).toBe(0);
    await expect(
      engine.services.threadAi.prepare(USER_ID, 'thr_missing' as ThreadId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
