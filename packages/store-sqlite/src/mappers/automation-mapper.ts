import { type Automation, type AutomationEntry, automationEntryOf } from '@relay/shared/domain';
import type { AutomationRow, automations } from '../schema';

export const toAutomationEntry = (row: AutomationRow): AutomationEntry => {
  const entry = automationEntryOf({
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
  if (entry === null) {
    throw new Error(`Automation ${row.id} is not readable`);
  }
  return entry;
};

export const toAutomationRow = (automation: Automation): typeof automations.$inferInsert => ({
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
