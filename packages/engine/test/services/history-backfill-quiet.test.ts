import type { SplitInput } from '@relay/shared/api';
import { describe, expect, it } from 'vitest';
import { ME, present, seedAccount } from '../support/fixtures';
import { backfillUntilDone, seedHistory, storedMessages } from '../support/history';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const GMAIL_SETTINGS = {
  imap: { host: 'imap.gmail.com', port: 993, secure: true },
  smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  username: ME.email,
};

const partners: SplitInput = {
  accountId: null,
  name: 'Partneri',
  order: 0,
  rules: [{ type: 'fromDomain', domain: 'partner.test' }],
  exclusive: true,
  hideTasks: false,
};

const pendingKinds = (engine: TestEngine): string[] => [
  ...new Set([...engine.db.tables.pendingWork.values()].map((work) => work.kind)),
];

const eventTypes = (engine: TestEngine): string[] => [
  ...new Set(engine.events.published.map((entry) => entry.event.type)),
];

describe('history backfill side effects', () => {
  it('ingests old inbox mail quietly without effects, Jira, calendar or arrivals', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    seedHistory(server, 'INBOX', 200, (index) => {
      if (index % 3 === 0) {
        return {
          from: { name: 'Jira', email: 'jira@company.test' },
          subject: `[REL-${String(index)}] Bug`,
        };
      }
      if (index % 3 === 1) {
        return { headers: { 'X-Test-Calendar': `invite-${String(index)}` } };
      }
      return {};
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const aiJobs = engine.db.tables.aiJobs.size;
    const tasks = engine.db.tables.tasks.size;
    const calendarEvents = engine.db.tables.calendarEvents.size;
    server.fetchedCalendarParts.length = 0;
    engine.events.clear();

    await backfillUntilDone(engine, account.id);

    expect(storedMessages(engine)).toHaveLength(200);
    expect(pendingKinds(engine)).toEqual([]);
    expect(eventTypes(engine)).toEqual(['threads.changed']);
    expect(engine.db.tables.aiJobs.size).toBe(aiJobs);
    expect(engine.db.tables.tasks.size).toBe(tasks);
    expect(engine.db.tables.calendarEvents.size).toBe(calendarEvents);
    expect(server.fetchedCalendarParts).toEqual([]);
    const invite = present(
      storedMessages(engine).find(
        (message) => message.bodyState === 'remote' && message.attachments.length > 0,
      ),
    );
    expect(invite.attachments).toEqual([
      expect.objectContaining({ filename: 'invite.ics', contentType: 'text/calendar' }),
    ]);
    const threads = [...engine.db.tables.threads.values()];
    expect(threads.every((thread) => thread.state === 'inbox')).toBe(true);
  });

  it('collapses a flush of many refreshed threads into one threads.changed event', async () => {
    const engine = createTestEngine({
      sync: { history: { sliceMessages: 300, sliceMs: 15_000, batch: 300 } },
    });
    const { account, server } = await seedAccount(engine);
    seedHistory(server, 'Archive', 340);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    engine.events.clear();

    const report = await engine.services.sync.backfillHistory(USER_ID, account.id);

    expect(report).toMatchObject({ skipped: false, processed: 300 });
    expect(engine.events.ofType('thread.upserted')).toEqual([]);
    expect(engine.events.ofType('threads.changed').map((event) => event.data)).toEqual([
      { accountId: account.id, count: 300 },
    ]);
  });

  it('keeps Gmail labels and exclusive split membership on history rows', async () => {
    const engine = createTestEngine();
    await engine.services.splits.replace(USER_ID, { splits: [partners] });
    const { account, server } = await seedAccount(
      engine,
      { settings: GMAIL_SETTINGS },
      { gmail: true },
    );
    server.addMailbox('Klienti', 'label', 501);
    seedHistory(server, 'Archive', 120, (index) => ({
      labels: ['\\Important', 'Klienti'],
      emailId: `gm-history-${String(index)}`,
    }));
    await engine.services.sync.syncAccount(USER_ID, account.id);

    await backfillUntilDone(engine, account.id);

    const label = present(
      (await engine.repositories.labels.list(USER_ID, null)).find(
        (item) => item.name === 'Klienti',
      ),
    );
    const history = storedMessages(engine).filter((message) => message.bodyState === 'remote');
    expect(history.length).toBeGreaterThan(50);
    expect(history.every((message) => message.labelIds.includes(label.id))).toBe(true);
    expect(history.every((message) => message.emailId?.startsWith('gm-history-'))).toBe(true);
    const split = present(
      (await engine.repositories.splits.listForAccount(USER_ID, account.id))[0],
    );
    const threads = history.map((message) =>
      present(engine.db.tables.threads.get(message.threadId)),
    );
    expect(threads.every((thread) => thread.splitIds.includes(split.id))).toBe(true);
    expect(threads.every((thread) => thread.labelIds.includes(label.id))).toBe(true);
  });
});
