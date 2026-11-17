import type { MailboxId } from '@relay/shared/domain';
import type { MailboxWindow } from './initial-window';

export interface MailboxProgress {
  readonly window: MailboxWindow;
  readonly processed: number;
}

export class InitialProgress {
  private readonly processed = new Map<MailboxId, number>();
  private readonly touched = new Set<MailboxId>();

  constructor(private readonly windows: readonly MailboxWindow[]) {
    windows.forEach((window) => this.processed.set(window.pass.mailbox.id, window.done));
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

  private of(windows: readonly MailboxWindow[]): MailboxProgress[] {
    return windows.map((window) => ({
      window,
      processed: this.processed.get(window.pass.mailbox.id) ?? window.done,
    }));
  }
}
