import { describe, expect, it } from 'vitest';
import { DEFAULT_SYNC_OPTIONS } from '../../src';
import { deliverMail, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';

const storedIds = (engine: ReturnType<typeof createTestEngine>): string[] =>
  [...engine.db.tables.messages.values()].map((message) => message.messageIdHeader ?? '').sort();

describe('initial sync window default', () => {
  it('keeps a 30-day window for engines without history backfill', () => {
    expect(DEFAULT_SYNC_OPTIONS.initialWindowDays).toBe(30);
  });

  it('imports mail between 15 and 30 days old on the first sync with the default options', async () => {
    const engine = createTestEngine();
    const { account, server } = await seedAccount(engine);
    deliverMail(server, 'INBOX', { id: 'old', date: '2026-10-25T08:00:00.000Z' });
    deliverMail(server, 'INBOX', { id: 'new', date: '2026-11-14T08:00:00.000Z' });

    const report = await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(report.ok).toBe(true);
    expect(storedIds(engine)).toEqual(['<new@mail.test>', '<old@mail.test>']);
  });
});
