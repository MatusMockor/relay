import { type Automation, AutomationSchema } from '@relay/shared/domain';
import type { AutomationRow, automations } from '../schema';

export const toAutomation = (row: AutomationRow): Automation =>
  AutomationSchema.parse({
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    name: row.name,
    enabled: row.enabled,
    order: row.position,
    preset: row.preset,
    conditions: row.conditions,
    ai: row.ai,
    actions: row.actions,
  });

export const toAutomationRow = (automation: Automation): typeof automations.$inferInsert => ({
  id: automation.id,
  userId: automation.userId,
  accountId: automation.accountId,
  name: automation.name,
  enabled: automation.enabled,
  position: automation.order,
  preset: automation.preset,
  conditions: automation.conditions,
  ai: automation.ai,
  actions: automation.actions,
});
