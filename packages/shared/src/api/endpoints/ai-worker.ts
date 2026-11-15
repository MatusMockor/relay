import { z } from 'zod';
import {
  AiFailureCodeSchema,
  AiJobSchema,
  AiOutputSchema,
  AiRunnerKindSchema,
  AiRunnerLocationSchema,
} from '../../domain/ai';
import { AiJobIdSchema } from '../../domain/ids';
import { IsoDateTimeSchema } from '../../domain/primitives';
import { ThreadDetailSchema } from '../../domain/thread';
import { idParamsOf } from '../common';
import { defineEndpoint } from '../endpoint';

export const MAIL_MCP_PATH = '/mcp';
export const AI_WORKER_CLAIM_LIMIT = 5;
export const AI_WORKER_ERROR_MAX_LENGTH = 2_000;

export const AiLeaseIdSchema = z.string().min(1).max(200);

export const ClaimAiJobsBodySchema = z
  .object({ limit: z.number().int().min(1).max(AI_WORKER_CLAIM_LIMIT).default(1) })
  .default({ limit: 1 });
export type ClaimAiJobsBody = z.infer<typeof ClaimAiJobsBodySchema>;

export const ClaimedAiJobSchema = z.object({
  job: AiJobSchema,
  leaseId: AiLeaseIdSchema,
  leaseUntil: IsoDateTimeSchema,
  thread: ThreadDetailSchema.nullable(),
});
export type ClaimedAiJob = z.infer<typeof ClaimedAiJobSchema>;

export const ClaimAiJobsResponseSchema = z.object({
  location: AiRunnerLocationSchema,
  jobs: z.array(ClaimedAiJobSchema),
});
export type ClaimAiJobsResponse = z.infer<typeof ClaimAiJobsResponseSchema>;

export const AiJobLeaseBodySchema = z.object({ leaseId: AiLeaseIdSchema });
export type AiJobLeaseBody = z.infer<typeof AiJobLeaseBodySchema>;

export const AiJobLeaseResponseSchema = z.object({ leaseUntil: IsoDateTimeSchema });
export type AiJobLeaseResponse = z.infer<typeof AiJobLeaseResponseSchema>;

export const CompleteAiJobBodySchema = z.object({
  leaseId: AiLeaseIdSchema,
  runner: AiRunnerKindSchema,
  output: AiOutputSchema,
});
export type CompleteAiJobBody = z.infer<typeof CompleteAiJobBodySchema>;

export const FailAiJobBodySchema = z.object({
  leaseId: AiLeaseIdSchema,
  code: AiFailureCodeSchema,
  message: z.string().max(AI_WORKER_ERROR_MAX_LENGTH),
});
export type FailAiJobBody = z.infer<typeof FailAiJobBodySchema>;

export const AiJobMailToolsTokenResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: IsoDateTimeSchema,
  path: z.string().startsWith('/'),
});
export type AiJobMailToolsTokenResponse = z.infer<typeof AiJobMailToolsTokenResponseSchema>;

const jobParams = idParamsOf(AiJobIdSchema);

export const aiWorkerEndpoints = {
  claimJobs: defineEndpoint({
    method: 'POST',
    path: '/ai/worker/claims',
    auth: 'user',
    body: ClaimAiJobsBodySchema,
    response: ClaimAiJobsResponseSchema,
  }),
  heartbeatJob: defineEndpoint({
    method: 'POST',
    path: '/ai/worker/jobs/:id/heartbeat',
    auth: 'user',
    params: jobParams,
    body: AiJobLeaseBodySchema,
    response: AiJobLeaseResponseSchema,
  }),
  completeJob: defineEndpoint({
    method: 'POST',
    path: '/ai/worker/jobs/:id/complete',
    auth: 'user',
    params: jobParams,
    body: CompleteAiJobBodySchema,
    response: AiJobSchema,
  }),
  failJob: defineEndpoint({
    method: 'POST',
    path: '/ai/worker/jobs/:id/fail',
    auth: 'user',
    params: jobParams,
    body: FailAiJobBodySchema,
    response: AiJobSchema,
  }),
  jobMailToolsToken: defineEndpoint({
    method: 'POST',
    path: '/ai/worker/jobs/:id/mail-tools-token',
    auth: 'user',
    params: jobParams,
    body: AiJobLeaseBodySchema,
    response: AiJobMailToolsTokenResponseSchema,
  }),
};
