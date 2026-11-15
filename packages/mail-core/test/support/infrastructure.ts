import type { Clock, ConditionalCredentialVault, IdGenerator } from '@relay/engine';
import type { AccountCredentials, AccountId, EntityIdMap, EntityKind } from '@relay/shared/domain';

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  generate<Kind extends EntityKind>(kind: Kind): EntityIdMap[Kind] {
    this.counter += 1;
    return `${kind}_${String(this.counter)}` as EntityIdMap[Kind];
  }
}

export class InMemoryCredentialVault implements ConditionalCredentialVault {
  readonly entries = new Map<AccountId, AccountCredentials>();

  get(accountId: AccountId): Promise<AccountCredentials | null> {
    return Promise.resolve(this.entries.get(accountId) ?? null);
  }

  set(accountId: AccountId, credentials: AccountCredentials): Promise<void> {
    this.entries.set(accountId, credentials);
    return Promise.resolve();
  }

  delete(accountId: AccountId): Promise<void> {
    this.entries.delete(accountId);
    return Promise.resolve();
  }

  setIfUnchanged(
    accountId: AccountId,
    expected: AccountCredentials,
    next: AccountCredentials,
  ): Promise<boolean> {
    const current = this.entries.get(accountId);
    if (current === undefined || JSON.stringify(current) !== JSON.stringify(expected)) {
      return Promise.resolve(false);
    }
    this.entries.set(accountId, next);
    return Promise.resolve(true);
  }
}
