import type { Page, PageRequest, TaskQuery, ThreadFolderQuery } from '@relay/engine';
import {
  type CalendarInvitation,
  type CalendarOccurrence,
  DraftIdSchema,
  TaskIdSchema,
  UserIdSchema,
  type Draft,
  type DraftContent,
  type FolderView,
  type Message,
  type Task,
  type ThreadDetail,
  type ThreadId,
  type ThreadState,
  type ThreadSummary,
  type UserId,
} from '@relay/shared/domain';
import type { MailToolCommands, MailToolQueries } from '../../src/backend/mail-tool-services';
import type { NewMailTask } from '../../src/backend/mail-tool-backend';
import type { CalendarRangeQuery } from '../../src/backend/calendar-tool-types';

const NOW = '2026-11-15T10:00:00+01:00';
const VIEW_STATES: Partial<Record<FolderView, ThreadState>> = {
  inbox: 'inbox',
  done: 'done',
  trash: 'trash',
  reminders: 'reminder',
};

function paginate<Item>(items: readonly Item[], request: PageRequest): Page<Item> {
  const offset = request.cursor === null ? 0 : Number(request.cursor);
  const end = offset + request.limit;
  return { items: items.slice(offset, end), nextCursor: end < items.length ? String(end) : null };
}

export class InMemoryMail implements MailToolQueries, MailToolCommands {
  readonly threads = new Map<UserId, ThreadSummary[]>();
  readonly messages: Message[] = [];
  readonly tasks: Task[] = [];
  readonly drafts: { userId: UserId; draft: Draft }[] = [];
  readonly occurrences: { userId: UserId; occurrence: CalendarOccurrence }[] = [];
  readonly invitations: { userId: UserId; invitation: CalendarInvitation }[] = [];
  readonly calendarRequests: { range: CalendarRangeQuery | null; timeZone: string }[] = [];

  addThread(userId: string, thread: ThreadSummary, messages: readonly Message[] = []): void {
    const owner = UserIdSchema.parse(userId);
    this.threads.set(owner, [...(this.threads.get(owner) ?? []), thread]);
    this.messages.push(...messages);
  }

  listFolder(userId: UserId, query: ThreadFolderQuery): Promise<Page<ThreadSummary>> {
    const search = query.search?.toLowerCase() ?? null;
    const state = VIEW_STATES[query.view];
    const items = (this.threads.get(userId) ?? []).filter(
      (thread) =>
        (state === undefined || thread.state === state) &&
        (query.accountId === null || thread.accountId === query.accountId) &&
        (search === null || `${thread.subject} ${thread.snippet}`.toLowerCase().includes(search)),
    );
    return Promise.resolve(paginate(items, query));
  }

  getThread(userId: UserId, threadId: ThreadId): Promise<ThreadDetail | null> {
    const thread = (this.threads.get(userId) ?? []).find((candidate) => candidate.id === threadId);
    if (thread === undefined) {
      return Promise.resolve(null);
    }
    const messages = this.messages.filter((candidate) => candidate.threadId === threadId);
    return Promise.resolve({
      thread,
      messages,
      aiSummary: null,
      checklist: [],
      replySuggestions: [],
    });
  }

  listTasks(userId: UserId, query: TaskQuery): Promise<Page<Task>> {
    const items = this.tasks.filter(
      (task) => task.userId === userId && (query.state === null || task.state === query.state),
    );
    return Promise.resolve(paginate(items, query));
  }

  listEvents(
    userId: UserId,
    range: CalendarRangeQuery,
    timeZone: string,
  ): Promise<CalendarOccurrence[]> {
    this.calendarRequests.push({ range, timeZone });
    const items = this.occurrences
      .filter((entry) => entry.userId === userId)
      .map((entry) => entry.occurrence)
      .filter((occurrence) => occurrence.start < range.to && occurrence.end > range.from);
    return Promise.resolve(items.slice(0, range.limit));
  }

  getThreadEvents(
    userId: UserId,
    threadId: ThreadId,
    timeZone: string,
  ): Promise<CalendarInvitation[]> {
    this.calendarRequests.push({ range: null, timeZone });
    return Promise.resolve(
      this.invitations
        .filter((entry) => entry.userId === userId && entry.invitation.threadId === threadId)
        .map((entry) => entry.invitation),
    );
  }

  createTask(userId: UserId, input: NewMailTask): Promise<Task> {
    const created: Task = {
      id: TaskIdSchema.parse(`tsk_${String(this.tasks.length + 1)}`),
      userId,
      threadId: input.threadId,
      jiraKey: null,
      title: input.title,
      aiWhat: input.aiWhat,
      state: 'open',
      source: 'ai',
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.tasks.push(created);
    return Promise.resolve(created);
  }

  createDraft(userId: UserId, content: DraftContent): Promise<Draft> {
    const draft: Draft = {
      ...content,
      id: DraftIdSchema.parse(`drf_${String(this.drafts.length + 1)}`),
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.drafts.push({ userId, draft });
    return Promise.resolve(draft);
  }
}
