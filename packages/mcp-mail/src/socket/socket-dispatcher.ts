import type { MailToolBackend } from '../backend/mail-tool-backend';
import { SOCKET_SCHEMAS, type SocketRequest } from './socket-protocol';

export function dispatchSocketRequest(
  backend: MailToolBackend,
  request: SocketRequest,
): Promise<unknown> {
  switch (request.method) {
    case 'listFolder':
      return backend.listFolder(SOCKET_SCHEMAS.listFolder.params.parse(request.params));
    case 'getThread':
      return backend.getThread(SOCKET_SCHEMAS.getThread.params.parse(request.params).threadId);
    case 'listTasks':
      return backend.listTasks(SOCKET_SCHEMAS.listTasks.params.parse(request.params));
    case 'createTask':
      return backend.createTask(SOCKET_SCHEMAS.createTask.params.parse(request.params));
    case 'createDraft':
      return backend.createDraft(SOCKET_SCHEMAS.createDraft.params.parse(request.params));
  }
}
