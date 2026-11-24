import type { HistoryProgress } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, ME, seedAccount } from '../support/fixtures';
import { backfillUntilDone, historyDate, seedHistory } from '../support/history';
import { createTestEngine, USER_ID } from '../support/test-engine';

const TIGHT = { sliceMessages: 10, sliceMs: 15_000, batch: 5, sliceSearches: 64 };
const GMAIL_SETTINGS = {
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  username: ME.email,
};

describe('history progress', () => {
  it('reports stored and total messages per account until the history is done', async () => {
    const engine = createTestEngine({ sync: { history: TIGHT } });
    const { account, server } = await seedAccount(engine);
    const total =
      seedHistory(server, 'Archive', 40).length + seedHistory(server, 'INBOX', 10).length;
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const [before] = await engine.services.sync.historyProgress(USER_ID);
    expect(before).toMatchObject({ accountId: account.id, total, state: 'running' });
    expect(before?.stored).toBeLessThan(total);
    engine.events.clear();

    const reports = await backfillUntilDone(engine, account.id);

    const published = engine.events.ofType('sync.history').map((event) => event.data);
    expect(reports.length).toBeGreaterThan(1);
    expect(published).toHaveLength(reports.length);
    const stored = published.map((progress) => progress.stored);
    expect(stored).toEqual([...stored].sort((left, right) => left - right));
    expect(published.at(-1)).toEqual({
      accountId: account.id,
      stored: total,
      total,
      state: 'done',
    });
    expect(await engine.services.sync.historyProgress(USER_ID)).toEqual([published.at(-1)]);
  });

  it('publishes nothing for a skipped slice and reports no progress without the store', async () => {
    const engine = createTestEngine({ historyBackfills: null });
    const { account, server } = await seedAccount(engine);
    seedHistory(server, 'Archive', 20);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    engine.events.clear();

    expect(await engine.services.sync.backfillHistory(USER_ID, account.id)).toEqual({
      skipped: true,
      reason: 'unsupported',
    });
    expect(engine.events.ofType('sync.history')).toEqual([]);
    expect(await engine.services.sync.historyProgress(USER_ID)).toEqual([]);
  });

  it('counts each Gmail message once through All Mail, Spam and Trash', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(
      engine,
      { settings: GMAIL_SETTINGS },
      { gmail: true },
    );
    server.addMailbox('Spam', 'spam');
    Array.from({ length: 10 }, (_, index) => {
      const spec = {
        id: `gm-${String(index)}`,
        emailId: `gm-${String(index)}`,
        labels: ['\\Inbox'],
        date: historyDate(index, 10),
      };
      deliverMail(server, 'INBOX', spec);
      deliverMail(server, 'Archive', spec);
      return spec;
    });
    deliverMail(server, 'Spam', { id: 'spam-1', emailId: 'gm-spam', date: historyDate(1, 2) });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    await backfillUntilDone(engine, account.id);

    expect(await engine.services.sync.historyProgress(USER_ID)).toEqual([
      { accountId: account.id, stored: 11, total: 11, state: 'done' },
    ]);
  });

  it('counts Gmail messages that share a Message-ID as separate messages', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(
      engine,
      { settings: GMAIL_SETTINGS },
      { gmail: true },
    );
    ['gm-a', 'gm-b'].forEach((emailId) => {
      deliverMail(server, 'INBOX', {
        id: 'echo',
        emailId,
        labels: ['\\Inbox'],
        date: historyDate(1, 2),
      });
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    await backfillUntilDone(engine, account.id);

    expect(engine.db.tables.messages.size).toBe(2);
    expect(await engine.services.sync.historyProgress(USER_ID)).toEqual([
      { accountId: account.id, stored: 2, total: 2, state: 'done' },
    ]);
  });

  it('counts Gmail inbox history at once instead of waiting for its All Mail copies', async () => {
    const engine = createTestEngine({ sync: { history: TIGHT } });
    const { account, server } = await seedAccount(
      engine,
      { settings: GMAIL_SETTINGS },
      { gmail: true },
    );
    Array.from({ length: 30 }, (_, index) => {
      const spec = {
        id: `old-${String(index)}`,
        emailId: `gm-old-${String(index)}`,
        labels: ['\\Inbox'],
        date: historyDate(index, 30),
      };
      deliverMail(server, 'INBOX', spec);
      deliverMail(server, 'Archive', spec);
      return spec;
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    engine.events.clear();

    await backfillUntilDone(engine, account.id);

    const stored = engine.events.ofType('sync.history').map((event) => event.data.stored);
    expect(stored.slice(0, 3)).toEqual([10, 20, 30]);
    expect(engine.events.ofType('sync.history').at(-1)?.data).toEqual({
      accountId: account.id,
      stored: 30,
      total: 30,
      state: 'done',
    });
  });

  it('reports waiting until a history mailbox finished its initial sync', async () => {
    const engine = createTestEngine({ sync: { batchSize: 2 } });
    const { account, server } = await seedAccount(engine);
    seedHistory(server, 'INBOX', 6, (index) => ({
      date: `2026-11-0${String(index + 1)}T08:00:00Z`,
    }));
    const reads: Promise<HistoryProgress[]>[] = [];
    engine.events.beforePublish = (event) => {
      if (event.type !== 'sync.progress' || event.data.processed >= (event.data.total ?? 0)) {
        return;
      }
      reads.push(engine.services.sync.historyProgress(USER_ID));
    };

    expect(await engine.services.sync.historyProgress(USER_ID)).toEqual([
      { accountId: account.id, stored: 0, total: 0, state: 'waiting' },
    ]);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const during = await Promise.all(reads);
    expect(during.length).toBeGreaterThan(1);
    expect(during.every(([progress]) => progress?.state === 'waiting')).toBe(true);
    const [after] = await engine.services.sync.historyProgress(USER_ID);
    expect(after?.state).toBe('running');
  });
});
