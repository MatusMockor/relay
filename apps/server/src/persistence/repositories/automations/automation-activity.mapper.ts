import type { AutomationActivityRecord } from '@relay/engine';
import { type AutomationActivity, AutomationActivityActionSchema } from '@relay/shared/domain';
import { z } from 'zod';
import type { automationActivity } from '../../schema';
import { toDate, toDateOrNull, toIso, toIsoOrNull } from '../../support/timestamps';

type ActivityRow = typeof automationActivity.$inferSelect;
type ActivityInsert = typeof automationActivity.$inferInsert;

export const toAutomationActivity = (row: ActivityRow): AutomationActivity => ({
  id: row.id,
  automationId: row.automationId,
  accountId: row.accountId,
  threadId: row.threadId,
  messageId: row.messageId,
  source: row.source,
  from: row.sender ?? null,
  subject: row.subject,
  actions: z.array(AutomationActivityActionSchema).parse(row.actions),
  createdAt: toIso(row.createdAt),
  undoneAt: toIsoOrNull(row.undoneAt),
});

export const toAutomationActivityInsert = (record: AutomationActivityRecord): ActivityInsert => ({
  id: record.id,
  userId: record.userId,
  automationId: record.automationId,
  accountId: record.accountId,
  threadId: record.threadId,
  messageId: record.messageId,
  source: record.source,
  sender: record.from,
  subject: record.subject,
  actions: record.actions,
  failedCount: record.actions.filter(({ outcome }) => outcome === 'failed').length,
  createdAt: toDate(record.createdAt),
  undoneAt: toDateOrNull(record.undoneAt),
});
