import type { AccountId } from '@relay/shared/domain';

type RunKind = 'sync' | 'history' | 'exclusive';

interface ActiveRun {
  readonly kind: RunKind;
  readonly done: Promise<unknown>;
}

export interface ExclusiveAccountRuns {
  exclusive<Result>(accountId: AccountId, work: () => Promise<Result>): Promise<Result>;
}

export class AccountRunQueue<SyncResult> implements ExclusiveAccountRuns {
  private readonly active = new Map<AccountId, ActiveRun>();
  private readonly queued = new Map<AccountId, Promise<SyncResult>>();
  private readonly waiting = new Map<AccountId, number>();

  sync(accountId: AccountId, work: () => Promise<SyncResult>): Promise<SyncResult> {
    const queued = this.queued.get(accountId);
    if (queued !== undefined) {
      return queued;
    }
    if (!this.active.has(accountId)) {
      return this.start(accountId, 'sync', work);
    }
    const next = this.startWhenIdle(accountId, 'sync', () => {
      this.queued.delete(accountId);
      return work();
    });
    this.queued.set(accountId, next);
    return next;
  }

  history<Result>(accountId: AccountId, work: () => Promise<Result>): Promise<Result> | null {
    if (this.active.has(accountId) || this.queued.has(accountId)) {
      return null;
    }
    return this.start(accountId, 'history', work);
  }

  exclusive<Result>(accountId: AccountId, work: () => Promise<Result>): Promise<Result> {
    this.waiting.set(accountId, (this.waiting.get(accountId) ?? 0) + 1);
    return this.startWhenIdle(accountId, 'exclusive', () => {
      this.release(accountId);
      return work();
    });
  }

  hasPendingSync(accountId: AccountId): boolean {
    return this.queued.has(accountId) || this.active.get(accountId)?.kind === 'sync';
  }

  hasPendingWork(accountId: AccountId): boolean {
    return this.hasPendingSync(accountId) || (this.waiting.get(accountId) ?? 0) > 0;
  }

  private async startWhenIdle<Result>(
    accountId: AccountId,
    kind: RunKind,
    work: () => Promise<Result>,
  ): Promise<Result> {
    for (
      let active = this.active.get(accountId);
      active !== undefined;
      active = this.active.get(accountId)
    ) {
      await active.done.catch(() => undefined);
    }
    return this.start(accountId, kind, work);
  }

  private release(accountId: AccountId): void {
    const remaining = (this.waiting.get(accountId) ?? 1) - 1;
    if (remaining > 0) {
      this.waiting.set(accountId, remaining);
      return;
    }
    this.waiting.delete(accountId);
  }

  private start<Result>(
    accountId: AccountId,
    kind: RunKind,
    work: () => Promise<Result>,
  ): Promise<Result> {
    const done = work().finally(() => this.active.delete(accountId));
    this.active.set(accountId, { kind, done });
    return done;
  }
}
