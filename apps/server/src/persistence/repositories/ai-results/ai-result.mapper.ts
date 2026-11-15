import { type AiResult, AiOutputSchema } from '@relay/shared/domain';
import type { aiResults } from '../../schema';
import { toDate, toIso } from '../../support/timestamps';

type AiResultRow = typeof aiResults.$inferSelect;
type AiResultInsert = typeof aiResults.$inferInsert;

export const toAiResult = (row: AiResultRow): AiResult => ({
  id: row.id,
  userId: row.userId,
  threadId: row.threadId,
  sourceMessageId: row.sourceMessageId,
  runner: row.runner,
  output: AiOutputSchema.parse(row.output),
  createdAt: toIso(row.createdAt),
});

export const toAiResultInsert = (result: AiResult): AiResultInsert => ({
  id: result.id,
  userId: result.userId,
  threadId: result.threadId,
  sourceMessageId: result.sourceMessageId,
  kind: result.output.kind,
  runner: result.runner,
  output: result.output,
  createdAt: toDate(result.createdAt),
});
