import type { Page, TaskQuery, ThreadFolderQuery } from '@relay/engine';
import type {
  Draft,
  DraftContent,
  Task,
  TaskPriority,
  ThreadDetail,
  ThreadId,
  ThreadSummary,
} from '@relay/shared/domain';
import type {
  CalendarEventsResult,
  CalendarRangeQuery,
  ThreadEventsResult,
} from './calendar-tool-types';

export interface NewMailTask {
  readonly threadId: ThreadId | null;
  readonly title: string;
  readonly aiWhat: string | null;
  readonly priority?: TaskPriority;
}

export interface MailToolBackend {
  listFolder(query: ThreadFolderQuery): Promise<Page<ThreadSummary>>;
  getThread(threadId: ThreadId): Promise<ThreadDetail | null>;
  listTasks(query: TaskQuery): Promise<Page<Task>>;
  createTask(task: NewMailTask): Promise<Task>;
  createDraft(content: DraftContent): Promise<Draft>;
  listEvents(range: CalendarRangeQuery): Promise<CalendarEventsResult>;
  getThreadEvents(threadId: ThreadId): Promise<ThreadEventsResult>;
}
