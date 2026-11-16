import type { ParsedCalendar, StoredCalendarEvent } from '../../src';
import { deliverMail, present, type SeededAccount } from './fixtures';
import { rows } from './range-invites';
import { type TestEngine, USER_ID } from './test-engine';

export const sync = (engine: TestEngine, seeded: SeededAccount) =>
  engine.services.sync.syncAccount(USER_ID, seeded.account.id);

export const deliverAt = (
  engine: TestEngine,
  seeded: SeededAccount,
  id: string,
  calendar: ParsedCalendar,
  date: string,
  path = 'INBOX',
): void => {
  engine.calendar.parser.register(id, calendar);
  deliverMail(seeded.server, path, { id, date, headers: { 'X-Test-Calendar': id } });
};

export const seedRebuild = async (engine: TestEngine, seeded: SeededAccount): Promise<void> => {
  const mailboxes = [...engine.db.tables.mailboxes.values()].filter(
    (mailbox) => mailbox.accountId === seeded.account.id,
  );
  for (const mailbox of mailboxes) {
    await engine.repositories.pendingWork.put({
      accountId: seeded.account.id,
      kind: 'calendar-rebuild',
      ref: mailbox.id,
      payload: { mailboxId: mailbox.id, afterUid: 0 },
      createdAt: '2026-11-16T07:00:00.000Z',
    });
  }
  seeded.server.fetchedCalendarParts.length = 0;
};

export const corrupt = (
  engine: TestEngine,
  row: StoredCalendarEvent | undefined,
  change: Partial<StoredCalendarEvent>,
): void => {
  const stored = present(row);
  engine.db.tables.calendarEvents.set(stored.id, {
    ...stored,
    ...change,
    revision: stored.revision + 1,
  });
};

export const rebuildWork = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()].filter(
    (work) => work.kind === 'calendar-rebuild' || work.kind === 'calendar-rebuild-part',
  );

export const snapshot = (engine: TestEngine) =>
  rows(engine).map((row) => [row.id, row.status, row.sequence, row.messageId]);
