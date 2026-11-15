import { z } from 'zod';
import {
  AiJobInputSchema,
  AiJobSchema,
  AiRunnerInfoSchema,
  AiRunnerKindSchema,
} from '../../domain/ai';
import { AiJobIdSchema } from '../../domain/ids';
import { idParamsOf } from '../common';
import { defineEndpoint } from '../endpoint';

export const CreateAiJobBodySchema = z.object({
  input: AiJobInputSchema,
  runner: AiRunnerKindSchema.optional(),
});
export type CreateAiJobBody = z.infer<typeof CreateAiJobBodySchema>;

export const aiEndpoints = {
  createJob: defineEndpoint({
    method: 'POST',
    path: '/ai/jobs',
    auth: 'user',
    body: CreateAiJobBodySchema,
    response: AiJobSchema,
  }),
  getJob: defineEndpoint({
    method: 'GET',
    path: '/ai/jobs/:id',
    auth: 'user',
    params: idParamsOf(AiJobIdSchema),
    response: AiJobSchema,
  }),
  runners: defineEndpoint({
    method: 'GET',
    path: '/ai/runners',
    auth: 'user',
    response: z.array(AiRunnerInfoSchema),
  }),
};
