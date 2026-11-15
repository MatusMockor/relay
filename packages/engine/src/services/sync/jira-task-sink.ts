import type { Task, ThreadId, UserId } from '@relay/shared/domain';
import type { JiraClassification } from '../../model/jira';

export interface JiraTaskEvent {
  readonly threadId: ThreadId;
  readonly classification: JiraClassification;
  readonly title: string;
}

export interface JiraTaskSink {
  applyJiraEvent(userId: UserId, event: JiraTaskEvent): Promise<Task>;
}
