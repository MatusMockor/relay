import type { Page, TaskQuery, ThreadFolderQuery } from '@relay/engine';
import type {
  Draft,
  DraftContent,
  Task,
  ThreadDetail,
  ThreadId,
  CalendarInvitation,
  CalendarOccurrence,
  ThreadSummary,
  UserId,
} from '@relay/shared/domain';
import type { CalendarRangeQuery } from './calendar-tool-types';
import type { MailToolBackend, NewMailTask } from './mail-tool-backend';

export interface MailToolQueries {
  listFolder(userId: UserId, query: ThreadFolderQuery): Promise<Page<ThreadSummary>>;
  getThread(userId: UserId, threadId: ThreadId): Promise<ThreadDetail | null>;
  listTasks(userId: UserId, query: TaskQuery): Promise<Page<Task>>;
  listEvents(
    userId: UserId,
    range: CalendarRangeQuery,
    timeZone: string,
  ): Promise<CalendarOccurrence[]>;
  getThreadEvents(
    userId: UserId,
    threadId: ThreadId,
    timeZone: string,
  ): Promise<CalendarInvitation[]>;
}

export interface MailToolCommands {
  createTask(userId: UserId, task: NewMailTask): Promise<Task>;
  createDraft(userId: UserId, content: DraftContent): Promise<Draft>;
}

export function scopeMailTools(
  queries: MailToolQueries,
  commands: MailToolCommands,
  userId: UserId,
  timeZone: () => string,
): MailToolBackend {
  return {
    listFolder: (query) => queries.listFolder(userId, query),
    getThread: (threadId) => queries.getThread(userId, threadId),
    listTasks: (query) => queries.listTasks(userId, query),
    createTask: (task) => commands.createTask(userId, task),
    createDraft: (content) => commands.createDraft(userId, content),
    listEvents: async (range) => {
      const zone = timeZone();
      return { timeZone: zone, occurrences: await queries.listEvents(userId, range, zone) };
    },
    getThreadEvents: async (threadId) => {
      const zone = timeZone();
      return { timeZone: zone, invitations: await queries.getThreadEvents(userId, threadId, zone) };
    },
  };
}
