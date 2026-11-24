import type {
  ConnectTaskSystemInput,
  ExternalTaskList,
  TaskSystemConnection,
  TaskSystemConnectionId,
  UserId,
} from '@relay/shared/domain';
import type { TaskSystemConnectionRepository } from '../../ports/task-system-connection-repository';
import type { TaskSystemConnector } from './task-system-connector';
import type { TaskSystemTaskReader } from './task-system-task-reader';
import { toTaskSystemConnection } from './task-system-view';

export interface TaskSystemServiceParts {
  readonly connections: TaskSystemConnectionRepository;
  readonly connector: TaskSystemConnector;
  readonly tasks: TaskSystemTaskReader;
}

export class TaskSystemService {
  constructor(private readonly parts: TaskSystemServiceParts) {}

  async list(userId: UserId): Promise<TaskSystemConnection[]> {
    const records = await this.parts.connections.list(userId);
    return records.map(toTaskSystemConnection);
  }

  connect(userId: UserId, input: ConnectTaskSystemInput): Promise<TaskSystemConnection> {
    return this.parts.connector.connect(userId, input);
  }

  disconnect(userId: UserId, connectionId: TaskSystemConnectionId): Promise<void> {
    return this.parts.connector.disconnect(userId, connectionId);
  }

  listTasks(userId: UserId, connectionId: TaskSystemConnectionId): Promise<ExternalTaskList> {
    return this.parts.tasks.list(userId, connectionId);
  }
}
