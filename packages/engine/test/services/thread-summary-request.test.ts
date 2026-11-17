import type { ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src';
import { deliverMail, present } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';
import { answerAll, jobsOf, syncedThread } from '../support/thread-ai';

const sourceOf = (job: { readonly input: { readonly kind: string } }): string | null =>
  'sourceMessageId' in job.input && typeof job.input.sourceMessageId === 'string'
    ? job.input.sourceMessageId
    : null;

describe('requesting a thread summary on demand', () => {
  it('queues the summary once per latest message and fills the thread detail', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    answerAll(engine);
    const { account, server, threadId } = await syncedThread(engine, {
      id: 'q1',
      subject: 'Termín',
    });

    expect(await engine.services.threadAi.requestSummary(USER_ID, threadId)).toMatchObject({
      pending: ['summary'],
    });
    expect(await engine.services.threadAi.requestSummary(USER_ID, threadId)).toMatchObject({
      pending: ['summary'],
    });
    expect(jobsOf(engine, 'summary')).toHaveLength(1);
    expect(jobsOf(engine, 'replySuggestions')).toHaveLength(0);

    await engine.services.ai.processQueued();
    const detail = await engine.services.threads.getDetail(USER_ID, threadId);
    expect(detail.aiSummary).toBe('Peter chce potvrdiť termín.');
    expect(detail.checklist.map((item) => item.text)).toEqual(['Potvrdiť termín']);
    expect(await engine.services.threadAi.requestSummary(USER_ID, threadId)).toMatchObject({
      pending: [],
    });
    expect(jobsOf(engine, 'summary')).toHaveLength(1);

    deliverMail(server, 'INBOX', {
      id: 'q2',
      subject: 'Re: Termín',
      inReplyTo: 'q1',
      date: '2026-11-15T10:30:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await engine.services.threadAi.requestSummary(USER_ID, threadId)).toMatchObject({
      pending: ['summary'],
    });
    expect(jobsOf(engine, 'summary')).toHaveLength(2);
  });

  it('summarizes Jira threads too and carries the device time zone', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { threadId } = await syncedThread(engine, {
      id: 'j1',
      subject: '[CMS-217] Editor stráca obrázky',
      from: { name: 'Jira', email: 'jira@firma.test' },
    });

    const state = await engine.services.threadAi.requestSummary(
      USER_ID,
      threadId,
      'Europe/Bratislava',
    );

    expect(state.pending).toEqual(['summary']);
    expect(state.jobs).toEqual([
      { kind: 'summary', jobId: present(jobsOf(engine, 'summary')[0]).id },
    ]);
    expect(present(jobsOf(engine, 'summary')[0]).input).toMatchObject({
      timeZone: 'Europe/Bratislava',
    });
  });

  it('treats a result as stale when a newer message arrived while its job ran', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    answerAll(engine);
    const { account, server, threadId } = await syncedThread(engine, {
      id: 's1',
      subject: 'Zdroj',
      date: '2026-11-15T08:00:00.000Z',
    });
    await engine.services.threadAi.requestSummary(USER_ID, threadId);
    const firstSource = sourceOf(present(jobsOf(engine, 'summary')[0]));
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

    expect(await engine.services.threadAi.requestSummary(USER_ID, threadId)).toMatchObject({
      pending: ['summary'],
    });
    const sources = jobsOf(engine, 'summary').map(sourceOf);
    expect(sources).toHaveLength(2);
    expect(sources[1]).not.toBe(firstSource);

    await engine.services.ai.processQueued();
    expect(await engine.services.threadAi.requestSummary(USER_ID, threadId)).toMatchObject({
      pending: [],
    });
  });

  it('joins an explicit job to the requested one', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    answerAll(engine);
    const { threadId } = await syncedThread(engine, { id: 'e1', subject: 'Spolu' });
    const requested = await engine.services.threadAi.requestSummary(USER_ID, threadId);

    const explicit = await engine.services.ai.createJob(USER_ID, {
      input: { kind: 'summary', threadId },
    });

    expect(requested.jobs).toContainEqual({ kind: 'summary', jobId: explicit.id });
    expect(jobsOf(engine, 'summary')).toHaveLength(1);
  });

  it('never lets an older job replace the result of a newer one', async () => {
    const engine = createTestEngine({ aiRunnerLocation: 'server', ai: { oneLinersPerSync: 0 } });
    const { account, server, threadId } = await syncedThread(engine, {
      id: 'o1',
      subject: 'Poradie',
      date: '2026-11-15T08:00:00.000Z',
    });
    await engine.services.settings.update(USER_ID, { ai: { location: 'local' } });
    await engine.services.threadAi.requestSummary(USER_ID, threadId);
    const slow = present((await engine.services.ai.claimExternal(USER_ID, 'dev_slow', 1)).jobs[0]);

    engine.clock.advance(60_000);
    deliverMail(server, 'INBOX', {
      id: 'o2',
      subject: 'Re: Poradie',
      inReplyTo: 'o1',
      date: '2026-11-15T09:00:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    await engine.services.threadAi.requestSummary(USER_ID, threadId);
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
    expect(await engine.services.threadAi.requestSummary(USER_ID, threadId)).toMatchObject({
      pending: [],
    });
  });

  it('respects the turned off summaries feature and unknown threads', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { threadId } = await syncedThread(engine, { id: 'f1', subject: 'Vypnuté' });
    await engine.services.settings.update(USER_ID, { ai: { features: { summaries: false } } });

    expect(await engine.services.threadAi.requestSummary(USER_ID, threadId)).toMatchObject({
      pending: [],
    });
    expect(engine.db.tables.aiJobs.size).toBe(0);
    await expect(
      engine.services.threadAi.requestSummary(USER_ID, 'thr_missing' as ThreadId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
