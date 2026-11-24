import type { AutomationActivityRecord } from '@relay/engine';
import { type AutomationActivity, AutomationActivitySchema } from '@relay/shared/domain';
import type { AutomationActivityRow, automationActivity } from '../schema';
import { toTimestamp } from './timestamp';

export const toAutomationActivity = (row: AutomationActivityRow): AutomationActivity =>
  AutomationActivitySchema.parse({
    id: row.id,
    automationId: row.automationId,
    accountId: row.accountId,
    threadId: row.threadId,
    messageId: row.messageId,
    source: row.source,
    from: row.sender ?? null,
    subject: row.subject,
    actions: row.actions,
    createdAt: row.createdAt,
    undoneAt: row.undoneAt,
  });

export const toAutomationActivityRow = (
  record: AutomationActivityRecord,
): typeof automationActivity.$inferInsert => ({
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
  createdAt: record.createdAt,
  createdTs: toTimestamp(record.createdAt),
  undoneAt: record.undoneAt,
});
