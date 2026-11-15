import type { AccountId } from '@relay/shared/domain';

export type StopWatching = () => Promise<void>;

export interface MailboxWatcher {
  watch(accountId: AccountId): Promise<StopWatching>;
}
