import { NotFoundError, type EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { MailToolBackend } from './mail-tool-backend';
import { scopeMailTools, type MailToolCommands, type MailToolQueries } from './mail-tool-services';

export type MailToolEngineServices = Pick<
  EngineServices,
  'inbox' | 'threads' | 'tasks' | 'compose' | 'calendar'
>;

export function engineMailTools(
  services: MailToolEngineServices,
): MailToolQueries & MailToolCommands {
  return {
    listFolder: (userId, query) =>
      services.inbox.list(userId, {
        view: query.view,
        accountId: query.accountId ?? undefined,
        splitId: query.splitId ?? undefined,
        labelId: query.labelId ?? undefined,
        q: query.search ?? undefined,
        cursor: query.cursor ?? undefined,
        limit: query.limit,
      }),
    getThread: async (userId, threadId) => {
      try {
        return await services.threads.getDetail(userId, threadId, { markRead: false });
      } catch (error) {
        if (error instanceof NotFoundError) {
          return null;
        }
        throw error;
      }
    },
    listTasks: (userId, query) =>
      services.tasks.list(userId, {
        state: query.state ?? undefined,
        cursor: query.cursor ?? undefined,
        limit: query.limit,
      }),
    listEvents: async (userId, range, timeZone) =>
      (await services.calendar.occurrences(userId, { from: range.from, to: range.to, timeZone }))
        .filter((occurrence) => occurrence.status !== 'cancelled')
        .slice(0, range.limit),
    getThreadEvents: (userId, threadId, timeZone) =>
      services.calendar.invitations(userId, threadId, timeZone),
    createTask: (userId, task) => services.tasks.createFromAi(userId, task),
    createDraft: (userId, content) => services.compose.createDraft(userId, content),
  };
}

export function engineMailToolBackend(
  services: MailToolEngineServices,
  userId: UserId,
  timeZone: () => string,
): MailToolBackend {
  const tools = engineMailTools(services);
  return scopeMailTools(tools, tools, userId, timeZone);
}
