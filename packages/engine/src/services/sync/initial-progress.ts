import type { MailboxId } from '@relay/shared/domain';
import type { MailboxWindow } from './initial-window';

export interface MailboxProgress {
  readonly window: MailboxWindow;
  readonly processed: number;
}

export interface ProgressTotals {
  readonly processed: number;
  readonly total: number;
}

export class InitialProgress {
  private readonly processed = new Map<MailboxId, number>();
  private readonly touched = new Set<MailboxId>();
  private readonly windows: MailboxWindow[] = [];
  private openedCount = 0;

  constructor(readonly mailboxes: number) {}

  opened(): number {
    this.openedCount += 1;
    return this.openedCount;
  }

  add(windows: readonly MailboxWindow[]): void {
    windows.forEach((window) => {
      this.windows.push(window);
      this.processed.set(window.pass.mailbox.id, window.done);
    });
  }

  advance(mailboxId: MailboxId): void {
    this.processed.set(mailboxId, (this.processed.get(mailboxId) ?? 0) + 1);
    this.touched.add(mailboxId);
  }

  takeTouched(): MailboxProgress[] {
    const touched = this.of(
      this.windows.filter((window) => this.touched.has(window.pass.mailbox.id)),
    );
    this.touched.clear();
    return touched;
  }

  all(): MailboxProgress[] {
    return this.of(this.windows);
  }

  totals(mailboxes: ReadonlySet<MailboxId> | null = null): ProgressTotals {
    const counted = this.all().filter(
      ({ window }) => mailboxes === null || mailboxes.has(window.pass.mailbox.id),
    );
    return counted.reduce(
      (sum, { window, processed }) => ({
        processed: sum.processed + Math.min(processed, window.total),
        total: sum.total + window.total,
      }),
      { processed: 0, total: 0 },
    );
  }

  private of(windows: readonly MailboxWindow[]): MailboxProgress[] {
    return windows.map((window) => ({
      window,
      processed: this.processed.get(window.pass.mailbox.id) ?? window.done,
    }));
  }
}
