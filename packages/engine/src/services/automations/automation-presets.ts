import {
  type AiRunnerKind,
  type Automation,
  type AutomationId,
  AutomationIdSchema,
  type UserId,
} from '@relay/shared/domain';

export const JIRA_TASKS_PRESET_NAME = 'Jira tasky';

const VIRTUAL_JIRA_TASKS_ID = AutomationIdSchema.parse('automation_default_jira_tasks');

export const jiraTasksPreset = (
  userId: UserId,
  id: AutomationId,
  runner: AiRunnerKind,
  order: number,
): Automation => ({
  id,
  userId,
  accountId: null,
  name: JIRA_TASKS_PRESET_NAME,
  enabled: true,
  order,
  preset: 'jiraTasks',
  conditions: [{ type: 'jira', projectKeys: [] }],
  ai: { runner, model: null, effort: null, instructions: null },
  actions: ['task'],
});

export const hasJiraTasksPreset = (automations: readonly Automation[]): boolean =>
  automations.some((automation) => automation.preset === 'jiraTasks');

export const effectiveJiraTasksPreset = (
  userId: UserId,
  stored: readonly Automation[],
  runner: AiRunnerKind,
): Automation =>
  stored.find((automation) => automation.preset === 'jiraTasks') ??
  jiraTasksPreset(userId, VIRTUAL_JIRA_TASKS_ID, runner, 0);

export const runsLegacyJiraTasks = (automation: Automation): boolean =>
  automation.preset === 'jiraTasks' &&
  automation.enabled &&
  automation.actions.includes('task') &&
  automation.ai.instructions === null;

export const appliesToAccount = (automation: Automation, accountId: string): boolean =>
  automation.accountId === null || automation.accountId === accountId;
