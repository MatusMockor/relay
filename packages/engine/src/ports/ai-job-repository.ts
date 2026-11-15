import type {
  AiJob,
  AiJobId,
  AiJobStatus,
  AiOutput,
  AiRunnerLocation,
  UserId,
} from '@relay/shared/domain';

export interface AiJobUpdate {
  readonly status: AiJobStatus;
  readonly output?: AiOutput | null;
  readonly error?: string | null;
  readonly updatedAt: string;
  readonly owner?: string;
  readonly leaseUntil?: string;
  readonly fromStatus?: AiJobStatus;
}

export interface AiJobClaim {
  readonly owner: string;
  readonly location?: AiRunnerLocation;
  readonly now: string;
  readonly leaseUntil: string;
}

export interface QueuedAiJobQuery {
  readonly location: AiRunnerLocation;
  readonly userId?: UserId;
  readonly now: string;
  readonly limit: number;
}

export interface AiJobEnqueueResult {
  readonly job: AiJob | null;
  readonly created: boolean;
}

export interface AiJobRepository {
  findById(userId: UserId, jobId: AiJobId): Promise<AiJob | null>;
  create(job: AiJob, claim?: AiJobClaim): Promise<AiJob>;
  update(jobId: AiJobId, update: AiJobUpdate): Promise<AiJob | null>;
  claim(jobId: AiJobId, claim: AiJobClaim): Promise<AiJob | null>;
  listQueued(query: QueuedAiJobQuery): Promise<AiJob[]>;
  enqueueIfAbsent(job: AiJob): Promise<AiJobEnqueueResult>;
  lockResultSlot(job: AiJob): Promise<void>;
  hasNewerDone(job: AiJob): Promise<boolean>;
  relocateQueued(userId: UserId, location: AiRunnerLocation, updatedAt: string): Promise<AiJob[]>;
}
