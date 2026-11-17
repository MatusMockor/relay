import type { ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src';
import { deliverMail, ME, present, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';
import { answerAll, inboxThread, jobsOf, syncedThread } from '../support/thread-ai';

describe('preparing thread AI on open', () => {
  it('queues reply suggestions once per latest message and never the summary', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    answerAll(engine);
    const { account, server, threadId } = await syncedThread(engine, {
      id: 'p1',
      subject: 'Termín',
    });

    expect(await engine.services.threadAi.prepare(USER_ID, threadId)).toMatchObject({
      pending: ['replySuggestions'],
    });
    expect(await engine.services.threadAi.prepare(USER_ID, threadId)).toMatchObject({
      pending: ['replySuggestions'],
    });
    expect(jobsOf(engine, 'summary')).toHaveLength(0);
    expect(jobsOf(engine, 'replySuggestions')).toHaveLength(1);
    expect(engine.events.ofType('ai.job.updated').length).toBeGreaterThan(0);

    await engine.services.ai.processQueued();
    const detail = await engine.services.threads.getDetail(USER_ID, threadId);
    expect(detail.aiSummary).toBeNull();
    expect(detail.checklist).toEqual([]);
    expect(detail.replySuggestions.map((suggestion) => suggestion.label)).toEqual([
      'Potvrdiť',
      'Presunúť',
      'Odmietnuť',
    ]);
    expect(await engine.services.threadAi.prepare(USER_ID, threadId)).toMatchObject({
      pending: [],
    });

    engine.clock.advance(60 * 60_000);
    deliverMail(server, 'INBOX', {
      id: 'p2',
      subject: 'Re: Termín',
      inReplyTo: 'p1',
      date: '2026-11-15T10:30:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await engine.services.threadAi.prepare(USER_ID, threadId)).toMatchObject({
      pending: ['replySuggestions'],
    });
    expect(jobsOf(engine, 'replySuggestions')).toHaveLength(2);
    expect(jobsOf(engine, 'summary')).toHaveLength(0);
  });

  it('keeps an earlier summary as it is when the thread is opened after a new message', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    answerAll(engine);
    const { account, server, threadId } = await syncedThread(engine, {
      id: 'k1',
      subject: 'Skoršie',
    });
    await engine.services.threadAi.requestSummary(USER_ID, threadId);
    await engine.services.ai.processQueued();

    deliverMail(server, 'INBOX', {
      id: 'k2',
      subject: 'Re: Skoršie',
      inReplyTo: 'k1',
      date: '2026-11-15T10:30:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    await engine.services.threadAi.prepare(USER_ID, threadId);

    expect(jobsOf(engine, 'summary')).toHaveLength(1);
    const detail = await engine.services.threads.getDetail(USER_ID, threadId);
    expect(detail.aiSummary).toBe('Peter chce potvrdiť termín.');
    expect(detail.checklist).toHaveLength(1);
  });

  it('does not queue a second job while the first one is running', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { threadId } = await syncedThread(engine, { id: 'r1', subject: 'Beží' });
    await engine.services.threadAi.prepare(USER_ID, threadId);
    const queued = present(jobsOf(engine, 'replySuggestions')[0]);
    const now = engine.clock.now();
    const claimed = await engine.repositories.aiJobs.claim(queued.id, {
      owner: 'other-worker',
      now: now.toISOString(),
      leaseUntil: new Date(now.getTime() + 60_000).toISOString(),
    });
    expect(claimed?.status).toBe('running');

    const state = await engine.services.threadAi.prepare(USER_ID, threadId);
    expect(state.pending).toEqual(['replySuggestions']);
    expect(state.jobs).toContainEqual({ kind: 'replySuggestions', jobId: queued.id });
    expect(jobsOf(engine, 'replySuggestions')).toHaveLength(1);
  });

  it('carries the device time zone into the prepared jobs', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { threadId } = await syncedThread(engine, { id: 'z1', subject: 'Zóna' });

    await engine.services.threadAi.prepare(USER_ID, threadId, 'Europe/Bratislava');

    expect(present(jobsOf(engine, 'replySuggestions')[0]).input).toMatchObject({
      timeZone: 'Europe/Bratislava',
    });
  });

  it('queues one job when the thread is opened twice at the same time', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { threadId } = await syncedThread(engine, { id: 'c1', subject: 'Súbežne' });

    const states = await Promise.all([
      engine.services.threadAi.prepare(USER_ID, threadId),
      engine.services.threadAi.prepare(USER_ID, threadId),
      engine.services.threadAi.prepare(USER_ID, threadId),
    ]);

    expect(states.map((state) => state.pending)).toEqual([
      ['replySuggestions'],
      ['replySuggestions'],
      ['replySuggestions'],
    ]);
    expect(jobsOf(engine, 'replySuggestions')).toHaveLength(1);
    expect(jobsOf(engine, 'summary')).toHaveLength(0);
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

    expect(await engine.services.threadAi.prepare(USER_ID, jira)).toMatchObject({ pending: [] });
    expect(await engine.services.threadAi.prepare(USER_ID, own)).toMatchObject({ pending: [] });
    expect(engine.db.tables.aiJobs.size).toBe(0);
  });

  it('respects turned off features and unknown threads', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
    const { threadId } = await syncedThread(engine, { id: 'f1', subject: 'Vypnuté' });
    await engine.services.settings.update(USER_ID, {
      ai: { features: { replySuggestions: false } },
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
