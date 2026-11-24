import { z } from 'zod';
import { AccountIdSchema } from './ids';

export const HistoryStateSchema = z.enum(['waiting', 'running', 'done', 'paused', 'error']);
export type HistoryState = z.infer<typeof HistoryStateSchema>;

export const HistoryProgressSchema = z.object({
  accountId: AccountIdSchema,
  stored: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  state: HistoryStateSchema,
});
export type HistoryProgress = z.infer<typeof HistoryProgressSchema>;
