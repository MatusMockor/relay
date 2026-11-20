import type { AccountId } from '@relay/shared/domain';

type RunKind = 'sync' | 'history';

interface ActiveRun {
  readonly kind: RunKind;
  readonly done: Promise<unknown>;
}

export class AccountRunQueue<SyncResult> {
  private readonly active = new Map<AccountId, ActiveRun>();
  private readonly queued = new Map<AccountId, Promise<SyncResult>>();

  sync(accountId: AccountId, work: () => Promise<SyncResult>): Promise<SyncResult> {
    const queued = this.queued.get(accountId);
    if (queued !== undefined) {
      return queued;
    }
    const active = this.active.get(accountId);
    if (active === undefined) {
      return this.start(accountId, 'sync', work);
    }
    const next = active.done
      .catch(() => undefined)
      .then(() => {
        this.queued.delete(accountId);
        return this.start(accountId, 'sync', work);
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

  hasPendingSync(accountId: AccountId): boolean {
    return this.queued.has(accountId) || this.active.get(accountId)?.kind === 'sync';
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
