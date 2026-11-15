import type { Logger } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import type { TimerHandle, Timers } from '../platform/timers';
import { type BackoffPolicy, backoffDelayMs, DEFAULT_IDLE_BACKOFF } from './backoff';
import type { MailboxWatcher, StopWatching } from './mailbox-watcher';

interface WatchSlot {
  attempts: number;
  stop: StopWatching | null;
  retry: TimerHandle | null;
  pending: Promise<void> | null;
  cancelled: boolean;
}

export interface IdleSupervisorDeps {
  readonly watcher: MailboxWatcher;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly backoff?: BackoffPolicy;
}

export class IdleSupervisor {
  private readonly slots = new Map<AccountId, WatchSlot>();

  constructor(private readonly deps: IdleSupervisorDeps) {}

  watching(): AccountId[] {
    return [...this.slots.entries()]
      .filter(([, slot]) => slot.stop !== null)
      .map(([accountId]) => accountId);
  }

  async reconcile(accountIds: readonly AccountId[]): Promise<void> {
    const wanted = new Set(accountIds);
    const removed = [...this.slots.keys()].filter((accountId) => !wanted.has(accountId));
    await Promise.all(removed.map((accountId) => this.release(accountId)));
    await Promise.all(
      [...wanted]
        .filter((accountId) => !this.slots.has(accountId))
        .map((accountId) => this.begin(accountId)),
    );
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.slots.keys()].map((accountId) => this.release(accountId)));
  }

  private async begin(accountId: AccountId): Promise<void> {
    const slot: WatchSlot = {
      attempts: 0,
      stop: null,
      retry: null,
      pending: null,
      cancelled: false,
    };
    this.slots.set(accountId, slot);
    await this.track(slot, this.attempt(accountId, slot));
  }

  private track(slot: WatchSlot, attempt: Promise<void>): Promise<void> {
    slot.pending = attempt.finally(() => {
      slot.pending = null;
    });
    return slot.pending;
  }

  private async attempt(accountId: AccountId, slot: WatchSlot): Promise<void> {
    slot.retry = null;
    slot.attempts += 1;
    try {
      const stop = await this.deps.watcher.watch(accountId);
      if (slot.cancelled) {
        await stop();
        return;
      }
      slot.stop = stop;
      slot.attempts = 0;
    } catch (error) {
      this.scheduleRetry(accountId, slot, error);
    }
  }

  private scheduleRetry(accountId: AccountId, slot: WatchSlot, error: unknown): void {
    if (slot.cancelled) {
      return;
    }
    const delayMs = backoffDelayMs(this.deps.backoff ?? DEFAULT_IDLE_BACKOFF, slot.attempts);
    this.deps.logger.warn('IMAP IDLE failed to start, retrying', { accountId, delayMs, error });
    slot.retry = this.deps.timers.after(delayMs, () => {
      void this.track(slot, this.attempt(accountId, slot));
    });
  }

  private async release(accountId: AccountId): Promise<void> {
    const slot = this.slots.get(accountId);
    if (slot === undefined) {
      return;
    }
    this.slots.delete(accountId);
    slot.cancelled = true;
    slot.retry?.cancel();
    await slot.pending?.catch(() => undefined);
    const stop = slot.stop;
    slot.stop = null;
    await stop?.().catch((error: unknown) => {
      this.deps.logger.warn('Failed to stop IMAP IDLE', { accountId, error });
    });
  }
}
