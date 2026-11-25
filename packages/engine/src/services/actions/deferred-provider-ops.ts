import type { AccountId, MailAccount } from '@relay/shared/domain';
import type { PendingProviderOp } from '../shared/provider-ops';
import type { ProviderOpSink } from './provider-op-sink';

interface AccountOps {
  readonly account: MailAccount;
  readonly ops: PendingProviderOp[];
}

export class DeferredProviderOps implements ProviderOpSink {
  private readonly pending = new Map<AccountId, AccountOps>();

  constructor(private readonly target: ProviderOpSink) {}

  apply(account: MailAccount, ops: readonly PendingProviderOp[]): Promise<void> {
    if (ops.length === 0) {
      return Promise.resolve();
    }
    const collected = this.pending.get(account.id) ?? { account, ops: [] };
    collected.ops.push(...ops);
    this.pending.set(account.id, collected);
    return Promise.resolve();
  }

  async flush(): Promise<void> {
    const collected = [...this.pending.values()];
    this.pending.clear();
    for (const { account, ops } of collected) {
      await this.target.apply(account, ops);
    }
  }
}
