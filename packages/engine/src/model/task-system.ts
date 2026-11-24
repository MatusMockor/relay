import type {
  ExternalTask,
  TaskSystemConnection,
  TaskSystemCredentials,
} from '@relay/shared/domain';

export interface TaskSystemConnectionRecord extends TaskSystemConnection {
  readonly externalAccountId: string;
}

export interface TaskSystemAccess {
  readonly siteUrl: string;
  readonly credentials: TaskSystemCredentials;
}

export interface TaskSystemAccount {
  readonly siteUrl: string;
  readonly externalAccountId: string;
  readonly accountName: string;
  readonly credentials?: TaskSystemCredentials;
}

export type RemoteExternalTask = Omit<ExternalTask, 'connectionId' | 'provider'>;

export interface RemoteTaskList {
  readonly tasks: RemoteExternalTask[];
  readonly truncated: boolean;
}
