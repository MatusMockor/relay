import {
  type AutomationAction,
  type AutomationActivity,
  AutomationActivityIdSchema,
  type AutomationId,
  MessageIdSchema,
} from '@relay/shared';
import type { DemoThreadRecord } from './demo-state';

export const applyActivityOf = (
  automationId: AutomationId,
  record: DemoThreadRecord,
  actions: readonly AutomationAction[],
  at: Date,
  sequence: number,
): AutomationActivity => {
  const message = record.messages.at(-1);
  return {
    id: AutomationActivityIdSchema.parse(`activity-${String(at.getTime())}-${String(sequence)}`),
    automationId,
    accountId: record.summary.accountId,
    threadId: record.summary.id,
    messageId: message?.id ?? MessageIdSchema.parse(record.summary.id),
    source: 'apply',
    from: message?.from ?? null,
    subject: message?.subject ?? record.summary.subject,
    actions: actions.map((action) => ({ action, outcome: 'ok' })),
    createdAt: at.toISOString(),
    undoneAt: null,
  };
};
