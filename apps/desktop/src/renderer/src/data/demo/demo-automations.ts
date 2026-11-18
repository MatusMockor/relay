import {
  type Automation,
  type AutomationInput,
  AutomationIdSchema,
  ReplaceAutomationsBodySchema,
} from '@relay/shared';
import type { Organizer } from '../MailClient';
import type { DemoState } from './demo-state';
import { demoIds } from './seed/ids';

type DemoAutomationMethods = Pick<Organizer, 'listAutomations' | 'replaceAutomations'>;

const automationId = (key: string) => AutomationIdSchema.parse(`automation-${key}`);

export const buildDemoAutomations = (): Automation[] => [
  {
    id: automationId('mentions'),
    userId: demoIds.user,
    accountId: demoIds.account('efa'),
    name: 'Jira spomenutia',
    enabled: true,
    order: 0,
    preset: null,
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
    actions: ['summary', 'task'],
  },
  {
    id: automationId('tibor'),
    userId: demoIds.user,
    accountId: null,
    name: 'Tibor',
    enabled: true,
    order: 1,
    preset: null,
    conditions: [{ type: 'fromAddress', address: 'tibor@codevo.app' }],
    ai: { runner: 'claude', model: 'claude-opus-5-5', effort: null, instructions: null },
    actions: ['task', 'notify'],
  },
  {
    id: automationId('jira'),
    userId: demoIds.user,
    accountId: null,
    name: 'Jira tasky',
    enabled: false,
    order: 2,
    preset: 'jiraTasks',
    conditions: [{ type: 'jira', projectKeys: [] }],
    ai: { runner: 'claude', model: null, effort: null, instructions: null },
    actions: ['task'],
  },
];

const toAutomation = (
  state: DemoState,
  input: AutomationInput,
  order: number,
  now: () => Date,
): Automation => {
  const existing = state.automations.find((item) => item.id === input.id);
  return {
    ...input,
    id: input.id ?? automationId(`n${String(order)}-${String(now().getTime())}`),
    userId: demoIds.user,
    preset: existing?.preset ?? null,
  };
};

export const createDemoAutomations = (
  state: DemoState,
  now: () => Date,
): DemoAutomationMethods => ({
  listAutomations: () => Promise.resolve([...state.automations]),
  replaceAutomations: (automations) => {
    const parsed = ReplaceAutomationsBodySchema.safeParse({ automations });
    if (!parsed.success) {
      return Promise.reject(new Error('Automatizácia nie je platná'));
    }
    const next = parsed.data.automations.map((input, order) =>
      toAutomation(state, input, order, now),
    );
    const keepsPreset = state.automations
      .filter((item) => item.preset !== null)
      .every((item) => next.some((automation) => automation.id === item.id));
    if (!keepsPreset || next.some((item) => item.preset !== null && item.accountId !== null)) {
      return Promise.reject(new Error('Predvolenú automatizáciu môžeš len vypnúť'));
    }
    state.automations = next;
    return Promise.resolve([...state.automations]);
  },
});
