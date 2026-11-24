import {
  type MessageIdRemap,
  remapActivityActions,
  remapAiJobInput,
  remapAiOutput,
} from '@relay/engine';
import {
  AiJobInputSchema,
  AiOutputSchema,
  AutomationActivityActionSchema,
} from '@relay/shared/domain';
import { z } from 'zod';
import type { JsonRewrite } from './message-references';

export type JsonValueRewrite = (value: unknown, remap: MessageIdRemap) => unknown;

const ActivityActionsSchema = z.array(AutomationActivityActionSchema);

const rewriteWith =
  <Schema extends z.ZodType>(
    schema: Schema,
    rewrite: (value: z.output<Schema>, remap: MessageIdRemap) => unknown,
  ): JsonValueRewrite =>
  (value, remap) => {
    const parsed = schema.safeParse(value);
    return parsed.success ? rewrite(parsed.data, remap) : null;
  };

export const JSON_REWRITES: Readonly<Record<JsonRewrite, JsonValueRewrite>> = {
  'ai-job-input': rewriteWith(AiJobInputSchema, remapAiJobInput),
  'ai-output': rewriteWith(AiOutputSchema, remapAiOutput),
  'activity-actions': rewriteWith(ActivityActionsSchema, remapActivityActions),
};
