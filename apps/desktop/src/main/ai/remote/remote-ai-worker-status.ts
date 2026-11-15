import type { AiJobId } from '@relay/shared/domain';

export type RemoteAiWorkerState =
  | 'stopped'
  | 'idle'
  | 'running'
  | 'serverLocation'
  | 'signedOut'
  | 'noRunner'
  | 'offline';

export interface RemoteAiWorkerStatus {
  readonly state: RemoteAiWorkerState;
  readonly serverUrl: string | null;
  readonly jobId: AiJobId | null;
  readonly detail: string | null;
}

export const STOPPED_STATUS: RemoteAiWorkerStatus = {
  state: 'stopped',
  serverUrl: null,
  jobId: null,
  detail: null,
};

export type RemoteAiStatusListener = (status: RemoteAiWorkerStatus) => void;
