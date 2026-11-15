import type { AiJob, AiJobId, AiJobStatus, AiOutput, UserId } from '@relay/shared/domain';

export interface AiJobUpdate {
  readonly status: AiJobStatus;
  readonly output?: AiOutput | null;
  readonly error?: string | null;
  readonly updatedAt: string;
}

export interface AiJobRepository {
  findById(userId: UserId, jobId: AiJobId): Promise<AiJob | null>;
  create(job: AiJob): Promise<AiJob>;
  update(jobId: AiJobId, update: AiJobUpdate): Promise<AiJob | null>;
}
