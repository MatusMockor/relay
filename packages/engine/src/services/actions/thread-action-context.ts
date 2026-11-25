import type { MailAccount, Message, ThreadSummary, UserId } from '@relay/shared/domain';
import type { ProviderOpSink } from './provider-op-sink';

export interface ThreadActionContext {
  readonly userId: UserId;
  readonly thread: ThreadSummary;
  readonly account: MailAccount;
  readonly messages: readonly Message[];
  readonly mirror?: ProviderOpSink;
}
