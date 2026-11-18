import type { AiRunnerKind, Automation, AutomationId, UserId } from '@relay/shared/domain';
import type { PresetAutomation } from '../../ports/automation-repository';

export const JIRA_TASKS_PRESET_NAME = 'Jira tasky';

export const jiraTasksPreset = (
  userId: UserId,
  id: AutomationId,
  runner: AiRunnerKind,
  order: number,
): PresetAutomation => ({
  id,
  userId,
  accountId: null,
  name: JIRA_TASKS_PRESET_NAME,
  enabled: false,
  order,
  preset: 'jiraTasks',
  conditions: [{ type: 'jira', projectKeys: [] }],
  ai: { runner, model: null, effort: null, instructions: null },
  actions: [{ type: 'task' }],
});

export const storedJiraTasksPreset = (automations: readonly Automation[]): Automation | null =>
  automations.find((automation) => automation.preset === 'jiraTasks') ?? null;

export const hasJiraTasksPreset = (automations: readonly Automation[]): boolean =>
  storedJiraTasksPreset(automations) !== null;

export const runsLegacyJiraTasks = (automation: Automation): boolean =>
  automation.preset === 'jiraTasks' &&
  automation.enabled &&
  automation.actions.some((action) => action.type === 'task') &&
  automation.ai.instructions === null;

export const appliesToAccount = (automation: Automation, accountId: string): boolean =>
  automation.accountId === null || automation.accountId === accountId;
