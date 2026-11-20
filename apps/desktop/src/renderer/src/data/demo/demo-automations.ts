import {
  type ApplyAutomationResponse,
  type Automation,
  type AutomationId,
  type AutomationInput,
  isParameterizedAction,
  ReplaceAutomationsBodySchema,
} from '@relay/shared';
import type { Organizer } from '../MailClient';
import { DEMO_UNSUPPORTED_EXCEPTIONS } from './demo-automation-match';
import { createDemoAutomationPreview } from './demo-automation-preview';
import type { DemoState } from './demo-state';
import { automationId, jiraTasksPreset } from './seed/automations';
import { demoIds } from './seed/ids';

type DemoAutomationMethods = Pick<
  Organizer,
  | 'listAutomations'
  | 'replaceAutomations'
  | 'restoreDefaultAutomation'
  | 'applyAutomation'
  | 'previewAutomation'
>;

const settled = <Result>(work: () => Result): Promise<Result> => {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
};

const UNSUPPORTED_EXCEPTION_MESSAGE =
  'Ukážka nevie vyhodnotiť výnimku na Jira udalosť ani na hlavičku mailu.';

const usesUnsupportedException = (input: AutomationInput): boolean =>
  (input.exceptions ?? []).some((condition) =>
    DEMO_UNSUPPORTED_EXCEPTIONS.includes(condition.type),
  );

const ALL_ACCOUNTS_MESSAGE = 'Pravidlo pre všetky účty nemôže presúvať ani štítkovať, vyber účet';

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
    match: input.match ?? existing?.match ?? 'all',
    exceptions: input.exceptions ?? existing?.exceptions ?? [],
  };
};

export const createDemoAutomations = (
  state: DemoState,
  now: () => Date,
  apply: (automationId: AutomationId) => ApplyAutomationResponse,
): DemoAutomationMethods => {
  const preview = createDemoAutomationPreview(state, now);
  return {
    listAutomations: () => Promise.resolve([...state.automations]),
    applyAutomation: (id) => settled(() => apply(id)),
    previewAutomation: (body) => settled(() => preview(body)),
    replaceAutomations: (automations) => {
      const parsed = ReplaceAutomationsBodySchema.safeParse({ automations });
      if (!parsed.success) {
        return Promise.reject(new Error('Automatizácia nie je platná'));
      }
      if (
        parsed.data.automations.some(
          (input) => input.accountId === null && input.actions.some(isParameterizedAction),
        )
      ) {
        return Promise.reject(new Error(ALL_ACCOUNTS_MESSAGE));
      }
      if (parsed.data.automations.some(usesUnsupportedException)) {
        return Promise.reject(new Error(UNSUPPORTED_EXCEPTION_MESSAGE));
      }
      const next = parsed.data.automations.map((input, order) =>
        toAutomation(state, input, order, now),
      );
      state.automations = next;
      return Promise.resolve([...state.automations]);
    },
    restoreDefaultAutomation: () => {
      if (state.automations.some((item) => item.preset === 'jiraTasks')) {
        return Promise.resolve([...state.automations]);
      }
      const id = automationId(`jira-${String(now().getTime())}`);
      state.automations = [...state.automations, jiraTasksPreset(id, state.automations.length)];
      return Promise.resolve([...state.automations]);
    },
  };
};
