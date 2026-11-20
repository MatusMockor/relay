import { z } from 'zod';
import { AutomationActionSchema } from '../../domain/automation-action';
import { AutomationActivitySchema } from '../../domain/automation-activity';
import { AutomationActivityIdSchema, AutomationIdSchema } from '../../domain/ids';
import { IsoDateTimeSchema } from '../../domain/primitives';
import { idParamsOf } from '../common';
import { defineEndpoint } from '../endpoint';

export const AUTOMATION_HISTORY_DAYS = 30;
export const AUTOMATION_HISTORY_LIMIT = 50;

export const AutomationHistoryStatsSchema = z.object({
  days: z.number().int().positive(),
  runs: z.number().int().nonnegative(),
  failedActions: z.number().int().nonnegative(),
  lastRunAt: IsoDateTimeSchema.nullable(),
});
export type AutomationHistoryStats = z.infer<typeof AutomationHistoryStatsSchema>;

export const AutomationHistoryResponseSchema = z.object({
  stats: AutomationHistoryStatsSchema,
  entries: z.array(AutomationActivitySchema).max(AUTOMATION_HISTORY_LIMIT),
});
export type AutomationHistoryResponse = z.infer<typeof AutomationHistoryResponseSchema>;

export const AutomationUndoOutcomeSchema = z.enum(['undone', 'skipped', 'failed', 'notUndoable']);
export type AutomationUndoOutcome = z.infer<typeof AutomationUndoOutcomeSchema>;

export const AutomationUndoResultSchema = z.object({
  action: AutomationActionSchema,
  outcome: AutomationUndoOutcomeSchema,
});
export type AutomationUndoResult = z.infer<typeof AutomationUndoResultSchema>;

export const UndoAutomationActivityResponseSchema = z.object({
  entry: AutomationActivitySchema,
  alreadyUndone: z.boolean(),
  results: z.array(AutomationUndoResultSchema),
});
export type UndoAutomationActivityResponse = z.infer<typeof UndoAutomationActivityResponseSchema>;

export const UndoAutomationSinceBodySchema = z.object({ since: IsoDateTimeSchema });
export type UndoAutomationSinceBody = z.infer<typeof UndoAutomationSinceBodySchema>;

export const UndoAutomationSinceResponseSchema = z.object({
  entries: z.number().int().nonnegative(),
  undone: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type UndoAutomationSinceResponse = z.infer<typeof UndoAutomationSinceResponseSchema>;

export const AutomationActivityParamsSchema = z.object({
  id: AutomationIdSchema,
  entryId: AutomationActivityIdSchema,
});

export const automationHistoryEndpoints = {
  history: defineEndpoint({
    method: 'GET',
    path: '/automations/:id/history',
    auth: 'user',
    params: idParamsOf(AutomationIdSchema),
    response: AutomationHistoryResponseSchema,
  }),
  undoEntry: defineEndpoint({
    method: 'POST',
    path: '/automations/:id/history/:entryId/undo',
    auth: 'user',
    params: AutomationActivityParamsSchema,
    response: UndoAutomationActivityResponseSchema,
  }),
  undoSince: defineEndpoint({
    method: 'POST',
    path: '/automations/:id/history/undo-since',
    auth: 'user',
    params: idParamsOf(AutomationIdSchema),
    body: UndoAutomationSinceBodySchema,
    response: UndoAutomationSinceResponseSchema,
  }),
};
