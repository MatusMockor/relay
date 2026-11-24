import type {
  TaskSystemConnectionId,
  TaskSystemCredentials,
  TaskSystemProvider,
  UserId,
} from '@relay/shared/domain';
import type {
  RemoteExternalTask,
  RemoteTaskList,
  TaskSystemAccess,
  TaskSystemAccount,
  TaskSystemAdapter,
  TaskSystemAdapterRegistry,
  TaskSystemAdapters,
  TaskSystemSecretStore,
} from '../../../src';

export class FakeTaskSystemAdapter implements TaskSystemAdapter {
  readonly provider: TaskSystemProvider = 'jira';
  readonly calls: { kind: 'verify' | 'list'; access: TaskSystemAccess }[] = [];
  account: TaskSystemAccount = {
    siteUrl: 'https://acme.atlassian.net',
    externalAccountId: 'acc-1',
    accountName: 'Alice Doe',
  };
  tasks: RemoteExternalTask[] = [];
  truncated = false;
  failWith: Error | null = null;
  credentials: TaskSystemCredentials | undefined = undefined;
  beforeAnswer: (() => Promise<void>) | null = null;

  verify(access: TaskSystemAccess): Promise<TaskSystemAccount> {
    this.calls.push({ kind: 'verify', access });
    return this.answer(
      this.credentials === undefined
        ? this.account
        : { ...this.account, credentials: this.credentials },
    );
  }

  listMyOpenTasks(access: TaskSystemAccess): Promise<RemoteTaskList> {
    this.calls.push({ kind: 'list', access });
    return this.answer({ tasks: this.tasks, truncated: this.truncated });
  }

  private async answer<Value>(value: Value): Promise<Value> {
    await this.beforeAnswer?.();
    if (this.failWith !== null) {
      throw this.failWith;
    }
    return value;
  }
}

const keyOf = (userId: UserId, connectionId: TaskSystemConnectionId): string =>
  `${userId}/${connectionId}`;

export class MemoryTaskSystemSecrets implements TaskSystemSecretStore {
  readonly stored = new Map<string, TaskSystemCredentials>();
  readonly writes: string[] = [];
  failSet: Error | null = null;
  failDelete: Error | null = null;

  of(userId: UserId, connectionId: TaskSystemConnectionId): TaskSystemCredentials | null {
    return this.stored.get(keyOf(userId, connectionId)) ?? null;
  }

  get(userId: UserId, connectionId: TaskSystemConnectionId): Promise<TaskSystemCredentials | null> {
    return Promise.resolve(this.of(userId, connectionId));
  }

  set(
    userId: UserId,
    connectionId: TaskSystemConnectionId,
    credentials: TaskSystemCredentials,
  ): Promise<void> {
    if (this.failSet !== null) {
      return Promise.reject(this.failSet);
    }
    this.writes.push(`set ${connectionId}`);
    this.stored.set(keyOf(userId, connectionId), credentials);
    return Promise.resolve();
  }

  delete(userId: UserId, connectionId: TaskSystemConnectionId): Promise<void> {
    if (this.failDelete !== null) {
      return Promise.reject(this.failDelete);
    }
    this.writes.push(`delete ${connectionId}`);
    this.stored.delete(keyOf(userId, connectionId));
    return Promise.resolve();
  }
}

export interface TaskSystemFakes extends TaskSystemAdapters {
  readonly jira: FakeTaskSystemAdapter;
  readonly secrets: MemoryTaskSystemSecrets;
}

export const createTaskSystemFakes = (): TaskSystemFakes => {
  const jira = new FakeTaskSystemAdapter();
  const registry: TaskSystemAdapterRegistry = {
    get: (provider) => (provider === jira.provider ? jira : null),
  };
  return { jira, registry, secrets: new MemoryTaskSystemSecrets() };
};
