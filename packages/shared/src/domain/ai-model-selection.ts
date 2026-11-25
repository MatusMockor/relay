import { z } from 'zod';
import { type AiRunnerKind, AiRunnerKindSchema } from './ai';
import { AiEffortSchema, AiModelIdSchema, refineAiModelChoice } from './ai-model-catalog';

export const AiModelSelectionSchema = z.object({
  runner: AiRunnerKindSchema,
  model: AiModelIdSchema.nullable(),
  effort: AiEffortSchema.nullable(),
});
export type AiModelSelection = z.infer<typeof AiModelSelectionSchema>;

export const AiModelSelectionInputSchema = AiModelSelectionSchema.superRefine(refineAiModelChoice);

export const runnerModelSelection = (runner: AiRunnerKind): AiModelSelection => ({
  runner,
  model: null,
  effort: null,
});
