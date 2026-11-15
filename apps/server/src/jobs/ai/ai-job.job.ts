import { AiJobIdSchema, UserIdSchema } from '@relay/shared/domain';
import { z } from 'zod';

export const AiJobJobSchema = z.object({ userId: UserIdSchema, jobId: AiJobIdSchema });
