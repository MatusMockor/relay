import type { HistoryProgress, MailAccount } from '@relay/shared';

const RUNNING = { stored: 12_340, total: 48_000 };
const DONE_TOTAL = 3_250;

export const demoHistoryProgress = (accounts: readonly MailAccount[]): HistoryProgress[] =>
  accounts.map((account, index) =>
    index === 0
      ? { accountId: account.id, ...RUNNING, state: 'running' }
      : { accountId: account.id, stored: DONE_TOTAL, total: DONE_TOTAL, state: 'done' },
  );
