import { describe, expect, it } from 'vitest';
import { deliverMail, ME, seedAccount } from '../support/fixtures';
import { backfillUntilDone, historyDate, seedHistory } from '../support/history';
import { createTestEngine, USER_ID } from '../support/test-engine';

const TIGHT = { sliceMessages: 200, sliceMs: 15_000, batch: 100, sliceSearches: 64 };
const GMAIL_SETTINGS = {
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  username: ME.email,
};

describe('history progress', () => {
  it('reports stored and total messages per account until the history is done', async () => {
    const engine = createTestEngine({ sync: { history: TIGHT } });
    const { account, server } = await seedAccount(engine);
    seedHistory(server, 'Archive', 700);
    seedHistory(server, 'INBOX', 50);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const [before] = await engine.services.sync.historyProgress(USER_ID);
    expect(before).toMatchObject({ accountId: account.id, total: 750, state: 'running' });
    expect(before?.stored).toBeLessThan(750);
    engine.events.clear();

    const reports = await backfillUntilDone(engine, account.id);

    const published = engine.events.ofType('sync.history').map((event) => event.data);
    expect(published).toHaveLength(reports.length);
    const stored = published.map((progress) => progress.stored);
    expect(stored).toEqual([...stored].sort((left, right) => left - right));
    expect(published.at(-1)).toEqual({
      accountId: account.id,
      stored: 750,
      total: 750,
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
});
