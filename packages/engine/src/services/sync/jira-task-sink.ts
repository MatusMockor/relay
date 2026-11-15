import type { Task, UserId } from '@relay/shared/domain';
import type { JiraEventWork } from '../../model/pending-work';

export type JiraTaskEvent = JiraEventWork;

export interface JiraTaskSink {
  applyJiraEvent(userId: UserId, event: JiraTaskEvent): Promise<Task>;
}
