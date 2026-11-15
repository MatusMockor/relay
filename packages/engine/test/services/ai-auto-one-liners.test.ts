import { DEFAULT_USER_SETTINGS, type ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, ME, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const queuedOneLiners = (engine: TestEngine): ThreadId[] =>
  [...engine.db.tables.aiJobs.values()]
    .filter((job) => job.kind === 'oneLiner' && job.status === 'queued')
    .flatMap((job) => (job.input.kind === 'oneLiner' ? [job.input.threadId] : []));

const threadIdOf = async (engine: TestEngine, subject: string): Promise<ThreadId | undefined> => {
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 100 });
  return page.items.find((thread) => thread.subject === subject)?.id;
};

const answer = (engine: TestEngine): void => {
  engine.claude.respondWith((request) => [
    {
      type: 'completed',
      output: { kind: 'oneLiner', text: `Zhrnutie ${request.thread?.thread.subject ?? ''}` },
    },
  ]);
};

describe('automatic AI one-liners', () => {
  it('queues one job per new personal inbox thread and does not repeat it', async () => {
    const engine = createTestEngine();
    answer(engine);
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'a1', subject: 'Ponuka' });
    deliverMail(server, 'INBOX', { id: 'a2', subject: 'Re: Ponuka', inReplyTo: 'a1' });
    deliverMail(server, 'INBOX', { id: 'own', subject: 'Moja poznámka', from: ME });
    deliverMail(server, 'INBOX', {
      id: 'news',
      subject: 'Newsletter',
      headers: { 'List-Unsubscribe': '<mailto:off@news.test>' },
    });
    deliverMail(server, 'INBOX', {
      id: 'bulk',
      subject: 'Akcia',
      headers: { Precedence: 'bulk' },
    });
    deliverMail(server, 'INBOX', {
      id: 'auto',
      subject: 'Automatická odpoveď',
      headers: { 'Auto-Submitted': 'auto-replied' },
    });
    deliverMail(server, 'Sent', { id: 's1', subject: 'Odoslané', from: ME });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const offer = await threadIdOf(engine, 'Ponuka');
    expect(queuedOneLiners(engine)).toEqual([offer]);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(queuedOneLiners(engine)).toEqual([offer]);

    await engine.services.ai.processQueued();
    deliverMail(server, 'INBOX', { id: 'other', subject: 'Iné' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(queuedOneLiners(engine)).toEqual([await threadIdOf(engine, 'Iné')]);

    engine.clock.advance(60 * 60_000);
    deliverMail(server, 'INBOX', {
      id: 'a3',
      subject: 'Re: Ponuka',
      inReplyTo: 'a2',
      date: '2026-11-15T10:30:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(queuedOneLiners(engine)).toEqual(expect.arrayContaining([offer]));
    expect(queuedOneLiners(engine)).toHaveLength(2);
  });

  it('caps the jobs per sync run and prefers the newest threads', async () => {
    const engine = createTestEngine({ ai: { oneLinersPerSync: 3 } });
    const { account, server } = await seedAccount(engine);
    ['01', '02', '03', '04', '05'].forEach((day) => {
      deliverMail(server, 'INBOX', {
        id: `m${day}`,
        subject: `Mail ${day}`,
        date: `2026-11-${day}T08:00:00.000Z`,
      });
    });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const expected = await Promise.all(
      ['Mail 05', 'Mail 04', 'Mail 03'].map((subject) => threadIdOf(engine, subject)),
    );
    expect(queuedOneLiners(engine)).toEqual(expected);
  });

  it('follows the feature toggle and the configured AI location', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    await engine.repositories.settings.save(USER_ID, {
      ...DEFAULT_USER_SETTINGS,
      ai: {
        ...DEFAULT_USER_SETTINGS.ai,
        features: { ...DEFAULT_USER_SETTINGS.ai.features, oneLiners: false },
      },
    });
    deliverMail(server, 'INBOX', { id: 'x1', subject: 'Vypnuté' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(queuedOneLiners(engine)).toEqual([]);

    await engine.services.settings.update(USER_ID, {
      ai: { location: 'server', features: { oneLiners: true } },
    });
    deliverMail(server, 'INBOX', { id: 'x2', subject: 'Zapnuté' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const jobs = [...engine.db.tables.aiJobs.values()];
    expect(jobs.map((job) => [job.runnerLocation, job.status])).toEqual([['server', 'queued']]);
    expect(await engine.services.ai.processQueued()).toEqual([]);
  });

  it('queues a fresh job when mail arrives while a job for the thread is running', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'r1', subject: 'Rozpočet' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const [running] = [...engine.db.tables.aiJobs.values()];
    await engine.repositories.aiJobs.claim(running?.id ?? ('missing' as never), {
      owner: 'busy-worker',
      now: engine.clock.now().toISOString(),
      leaseUntil: new Date(engine.clock.now().getTime() + 600_000).toISOString(),
    });

    deliverMail(server, 'INBOX', { id: 'r2', subject: 'Re: Rozpočet', inReplyTo: 'r1' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(queuedOneLiners(engine)).toEqual([await threadIdOf(engine, 'Rozpočet')]);
  });

  it('refreshes the one-liner for late mail with an old Date header', async () => {
    const engine = createTestEngine();
    answer(engine);
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'l1', subject: 'Zmluva' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    await engine.services.ai.processQueued();
    const contract = await threadIdOf(engine, 'Zmluva');
    engine.clock.advance(60 * 60_000);

    deliverMail(server, 'INBOX', {
      id: 'l2',
      subject: 'Re: Zmluva',
      inReplyTo: 'l1',
      date: '2026-11-14T08:00:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(contract).toBeDefined();
    expect(queuedOneLiners(engine)).toEqual([contract]);
  });

  it('queues a follow-up for late mail that arrives while a job for the thread runs', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'q1', subject: 'Neskoro' });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const [running] = [...engine.db.tables.aiJobs.values()];
    await engine.repositories.aiJobs.claim(running?.id ?? ('missing' as never), {
      owner: 'busy-worker',
      now: engine.clock.now().toISOString(),
      leaseUntil: new Date(engine.clock.now().getTime() + 600_000).toISOString(),
    });

    deliverMail(server, 'INBOX', {
      id: 'q2',
      subject: 'Re: Neskoro',
      inReplyTo: 'q1',
      date: '2026-11-14T08:00:00.000Z',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(running?.input.kind === 'oneLiner' ? running.input.threadId : null).not.toBeNull();
    expect(queuedOneLiners(engine)).toEqual([
      running?.input.kind === 'oneLiner' ? running.input.threadId : null,
    ]);
  });
});
