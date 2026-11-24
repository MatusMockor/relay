import type {
  TaskSystemConnectionId,
  TaskSystemCredentials,
  TaskSystemProvider,
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

  verify(access: TaskSystemAccess): Promise<TaskSystemAccount> {
    this.calls.push({ kind: 'verify', access });
    return this.answer(this.account);
  }

  listMyOpenTasks(access: TaskSystemAccess): Promise<RemoteTaskList> {
    this.calls.push({ kind: 'list', access });
    return this.answer({ tasks: this.tasks, truncated: this.truncated });
  }

  private answer<Value>(value: Value): Promise<Value> {
    return this.failWith === null ? Promise.resolve(value) : Promise.reject(this.failWith);
  }
}

export class MemoryTaskSystemSecrets implements TaskSystemSecretStore {
  readonly stored = new Map<TaskSystemConnectionId, TaskSystemCredentials>();
  failSet: Error | null = null;

  get(connectionId: TaskSystemConnectionId): Promise<TaskSystemCredentials | null> {
    return Promise.resolve(this.stored.get(connectionId) ?? null);
  }

  set(connectionId: TaskSystemConnectionId, credentials: TaskSystemCredentials): Promise<void> {
    if (this.failSet !== null) {
      return Promise.reject(this.failSet);
    }
    this.stored.set(connectionId, credentials);
    return Promise.resolve();
  }

  delete(connectionId: TaskSystemConnectionId): Promise<void> {
    this.stored.delete(connectionId);
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
