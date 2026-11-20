import {
  api,
  type Automation,
  type AutomationEntry,
  type AutomationInput,
  type AutomationReplaceItem,
  isUnsupportedAutomation,
  replaceInputsOf,
  supportedAutomations,
} from '@relay/shared';
import { MailClientError } from '../errors';
import type { HttpApi } from './HttpApi';

export const OUTDATED_AUTOMATIONS =
  'Server je starší a nepodporuje režim podmienok ani výnimky. Aktualizuj server.';

export const OUTDATED_PREVIEW =
  'Server je starší a nepodporuje náhľad pravidla. Aktualizuj server.';

const usesNewFields = (input: AutomationInput): boolean =>
  input.match === 'any' || (input.exceptions?.length ?? 0) > 0;

const counterpartOf = (
  input: AutomationInput,
  stored: readonly Automation[],
): Automation | undefined =>
  stored.find((automation) =>
    input.id === undefined
      ? automation.order === input.order && automation.name === input.name
      : automation.id === input.id,
  );

const keeps = (input: AutomationInput, automation: Automation | undefined): boolean =>
  automation !== undefined &&
  (input.match === undefined || automation.match === input.match) &&
  (input.exceptions === undefined || automation.exceptions.length === input.exceptions.length);

const inputOf = (automation: Automation): AutomationInput => ({
  id: automation.id,
  accountId: automation.accountId,
  name: automation.name,
  enabled: automation.enabled,
  order: automation.order,
  match: automation.match,
  conditions: automation.conditions,
  exceptions: automation.exceptions,
  ai: automation.ai,
  actions: automation.actions,
});

const restoreOf = (entry: AutomationEntry): AutomationReplaceItem =>
  isUnsupportedAutomation(entry) ? { id: entry.id, keep: true } : inputOf(entry);

export const replaceAutomationsChecked = async (
  http: HttpApi,
  items: AutomationReplaceItem[],
): Promise<AutomationEntry[]> => {
  const risky = replaceInputsOf(items).filter(usesNewFields);
  const previous = risky.length === 0 ? null : await http.call(api.automations.list, {});
  const stored = await http.call(api.automations.replace, { body: { automations: items } });
  const saved = supportedAutomations(stored);
  if (previous === null || risky.every((input) => keeps(input, counterpartOf(input, saved)))) {
    return stored;
  }
  await http
    .call(api.automations.replace, { body: { automations: previous.map(restoreOf) } })
    .catch(() => undefined);
  throw new MailClientError({ code: 'not_implemented', message: OUTDATED_AUTOMATIONS });
};

export const outdatedPreview = (error: unknown): unknown =>
  error instanceof MailClientError && error.status === 404
    ? new MailClientError({ code: 'not_implemented', message: OUTDATED_PREVIEW }, 404)
    : error;
