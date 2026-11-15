import type { MailAccount, Message, UserId } from '@relay/shared/domain';
import type { MessageHeaders } from '../../model/split-match-subject';

export interface InboxArrival {
  readonly message: Message;
  readonly headers: MessageHeaders;
}

export interface SyncArrivalBatch {
  readonly userId: UserId;
  readonly account: MailAccount;
  readonly startedAt: string;
  readonly arrivals: readonly InboxArrival[];
}

export interface SyncArrivalListener {
  onArrivals(batch: SyncArrivalBatch): Promise<void>;
}

export const IGNORE_ARRIVALS: SyncArrivalListener = {
  onArrivals: () => Promise.resolve(),
};
