import { type Automation, type AutomationId, AutomationIdSchema } from '@relay/shared';
import { demoIds } from './ids';

export const automationId = (key: string) => AutomationIdSchema.parse(`automation-${key}`);

export const jiraTasksPreset = (id: AutomationId, order: number): Automation => ({
  id,
  userId: demoIds.user,
  accountId: null,
  name: 'Jira tasky',
  enabled: false,
  order,
  preset: 'jiraTasks',
  match: 'all',
  conditions: [{ type: 'jira', projectKeys: [] }],
  exceptions: [],
  ai: { runner: 'claude', model: null, effort: null, instructions: null },
  actions: [{ type: 'task' }],
});

export const buildDemoAutomations = (): Automation[] => [
  {
    id: automationId('mentions'),
    userId: demoIds.user,
    accountId: demoIds.account('efa'),
    name: 'Jira spomenutia',
    enabled: true,
    order: 0,
    preset: null,
    match: 'all',
    exceptions: [],
    conditions: [
      { type: 'jiraEvent', kind: 'mention' },
      { type: 'jira', projectKeys: ['ECOM'] },
    ],
    ai: {
      runner: 'codex',
      model: 'gpt-6.1-sol',
      effort: 'high',
      instructions:
        'Úlohu vytvor, len ak odo mňa niekto niečo chce. Presun do sprintu a zmeny priority ignoruj.',
    },
    actions: [{ type: 'summary' }, { type: 'task' }],
  },
  {
    id: automationId('tibor'),
    userId: demoIds.user,
    accountId: null,
    name: 'Tibor',
    enabled: true,
    order: 1,
    preset: null,
    match: 'all',
    exceptions: [],
    conditions: [{ type: 'fromAddress', address: 'tibor@codevo.app' }],
    ai: { runner: 'claude', model: 'claude-opus-5-5', effort: null, instructions: null },
    actions: [{ type: 'task' }, { type: 'notify' }],
  },
  {
    id: automationId('gitlab'),
    userId: demoIds.user,
    accountId: demoIds.account('efa'),
    name: 'GitLab do Projektov',
    enabled: true,
    order: 2,
    preset: null,
    match: 'all',
    exceptions: [],
    conditions: [{ type: 'fromAddress', address: 'gitlab@firma.sk' }],
    ai: { runner: 'claude', model: null, effort: null, instructions: null },
    actions: [
      { type: 'addLabel', labelId: demoIds.label('efa') },
      { type: 'moveTo', mailboxId: demoIds.folder('efa', 'projekty') },
    ],
  },
  jiraTasksPreset(automationId('jira'), 3),
];
