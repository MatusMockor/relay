import type { AccountId, MessageId, Task, UserId } from '@relay/shared/domain';
import type { JiraEventWork } from '../../model/pending-work';

export type JiraTaskEvent = JiraEventWork;

export interface JiraEventOrigin {
  readonly accountId: AccountId;
  readonly messageId: MessageId;
}

export interface JiraTaskSink {
  applyJiraEvent(
    userId: UserId,
    event: JiraTaskEvent,
    origin: JiraEventOrigin,
  ): Promise<Task | null>;
}
