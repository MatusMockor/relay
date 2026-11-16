import { ForbiddenError } from '@relay/engine';
import type { MailToolBackend } from '@relay/mcp-mail';
import type { AiTaskKind } from '@relay/shared/domain';

const WRITING_KINDS: ReadonlySet<AiTaskKind> = new Set(['chatAnswer']);

const refuse = (kind: AiTaskKind) => (): Promise<never> =>
  Promise.reject(new ForbiddenError(`An AI ${kind} job cannot change mail data`));

export const scopeMailToolsToJob = (
  backend: MailToolBackend,
  kind: AiTaskKind,
): MailToolBackend => {
  if (WRITING_KINDS.has(kind)) {
    return backend;
  }
  return {
    listFolder: (query) => backend.listFolder(query),
    getThread: (threadId) => backend.getThread(threadId),
    listTasks: (query) => backend.listTasks(query),
    listEvents: (range) => backend.listEvents(range),
    getThreadEvents: (threadId) => backend.getThreadEvents(threadId),
    createTask: refuse(kind),
    createDraft: refuse(kind),
  };
};
