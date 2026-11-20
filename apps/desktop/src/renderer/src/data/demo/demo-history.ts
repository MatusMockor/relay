import type { AccountId, HistoryProgress, MailAccount, RealtimeEvent } from '@relay/shared';

const RUNNING = { stored: 12_340, total: 48_000 };
const DONE_TOTAL = 3_250;

export type DemoHistorySeed = (accounts: readonly MailAccount[]) => HistoryProgress[];

export const demoHistoryProgress: DemoHistorySeed = (accounts) =>
  accounts.map((account, index) =>
    index === 0
      ? { accountId: account.id, ...RUNNING, state: 'running' }
      : { accountId: account.id, stored: DONE_TOTAL, total: DONE_TOTAL, state: 'done' },
  );

type Emit = (event: RealtimeEvent) => void;

export class DemoHistory {
  private readonly published = new Map<AccountId, HistoryProgress>();
  private emit: Emit | null = null;
  private now: () => Date = () => new Date();
  private readCount = 0;

  constructor(private readonly seed: DemoHistorySeed = demoHistoryProgress) {}

  get reads(): number {
    return this.readCount;
  }

  bind(emit: Emit, now: () => Date): void {
    this.emit = emit;
    this.now = now;
  }

  progress(accounts: readonly MailAccount[]): HistoryProgress[] {
    this.readCount += 1;
    return this.seed(accounts).map((entry) => this.published.get(entry.accountId) ?? entry);
  }

  publish(progress: HistoryProgress): void {
    this.published.set(progress.accountId, progress);
    this.emit?.({ type: 'sync.history', at: this.now().toISOString(), data: progress });
  }
}
