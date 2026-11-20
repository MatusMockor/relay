import type { Automation } from '@relay/shared/domain';
import type { automations } from '../../schema';

type AutomationRow = typeof automations.$inferSelect;
type AutomationInsert = typeof automations.$inferInsert;

export const toAutomation = (row: AutomationRow): Automation => ({
  id: row.id,
  userId: row.userId,
  accountId: row.accountId,
  name: row.name,
  enabled: row.enabled,
  order: row.position,
  preset: row.preset,
  match: row.match,
  conditions: row.conditions,
  exceptions: row.exceptions,
  ai: row.ai,
  actions: row.actions,
});

export const toAutomationInsert = (automation: Automation): AutomationInsert => ({
  id: automation.id,
  userId: automation.userId,
  accountId: automation.accountId,
  name: automation.name,
  enabled: automation.enabled,
  position: automation.order,
  preset: automation.preset,
  match: automation.match,
  conditions: automation.conditions,
  exceptions: automation.exceptions,
  ai: automation.ai,
  actions: automation.actions,
});
