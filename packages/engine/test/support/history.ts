import type { AccountId, Message } from '@relay/shared/domain';
import type { HistorySliceReport } from '../../src';
import { deliverMail, type MailSpec } from './fixtures';
import type { FakeMailServer } from './mail/fake-mail-server';
import { TEST_NOW, type TestEngine, USER_ID } from './test-engine';

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 3 * 365;

export const historyDate = (index: number, count: number): string =>
  new Date(Date.parse(TEST_NOW) - DAY_MS * HISTORY_DAYS * (1 - index / count)).toISOString();

export const seedHistory = (
  server: FakeMailServer,
  path: string,
  count: number,
  spec: (index: number) => Partial<MailSpec> = () => ({}),
): number[] =>
  Array.from({ length: count }, (_, index) =>
    deliverMail(server, path, {
      id: `${path.toLowerCase().replace(/\W/g, '-')}-${String(index)}`,
      date: historyDate(index, count),
      ...spec(index),
    }),
  );

export const backfillUntilDone = async (
  engine: TestEngine,
  accountId: AccountId,
  limit = 50,
): Promise<HistorySliceReport[]> => {
  const reports: HistorySliceReport[] = [];
  for (let round = 0; round < limit; round += 1) {
    const report = await engine.services.sync.backfillHistory(USER_ID, accountId);
    reports.push(report);
    if (report.skipped || !report.more) {
      return reports;
    }
  }
  return reports;
};

export const storedMessages = (engine: TestEngine): Message[] => [
  ...engine.db.tables.messages.values(),
];

export const storedUidsIn = (engine: TestEngine, mailboxId: string): number[] =>
  storedMessages(engine)
    .filter((message) => message.mailboxId === mailboxId)
    .map((message) => message.uid)
    .sort((left, right) => left - right);

export const processedOf = (report: HistorySliceReport | undefined): number =>
  report === undefined || report.skipped ? 0 : report.processed;
