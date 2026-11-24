import type {
  TaskSystemConnectionId,
  TaskSystemConnectionStatus,
  TaskSystemProvider,
  UserId,
} from '@relay/shared/domain';
import type { TaskSystemConnectionRecord } from '../model/task-system';

export interface TaskSystemAccountRef {
  readonly provider: TaskSystemProvider;
  readonly siteUrl: string;
  readonly externalAccountId: string;
}

export interface TaskSystemStatusChange {
  readonly status: TaskSystemConnectionStatus;
  readonly lastError: string | null;
  readonly updatedAt: string;
}

export interface TaskSystemConnectionRepository {
  list(userId: UserId): Promise<TaskSystemConnectionRecord[]>;
  findById(userId: UserId, id: TaskSystemConnectionId): Promise<TaskSystemConnectionRecord | null>;
  findByAccount(
    userId: UserId,
    account: TaskSystemAccountRef,
  ): Promise<TaskSystemConnectionRecord | null>;
  save(record: TaskSystemConnectionRecord): Promise<TaskSystemConnectionRecord>;
  recordStatus(
    userId: UserId,
    id: TaskSystemConnectionId,
    change: TaskSystemStatusChange,
  ): Promise<TaskSystemConnectionRecord | null>;
  delete(userId: UserId, id: TaskSystemConnectionId): Promise<boolean>;
}
