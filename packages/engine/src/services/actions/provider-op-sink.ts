import type { MailAccount } from '@relay/shared/domain';
import type { PendingProviderOp } from '../shared/provider-ops';

export interface ProviderOpSink {
  apply(account: MailAccount, ops: readonly PendingProviderOp[]): Promise<void>;
}
