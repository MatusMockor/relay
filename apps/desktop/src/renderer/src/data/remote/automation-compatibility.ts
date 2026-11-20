import { api, type Automation, type AutomationInput } from '@relay/shared';
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

export const replaceAutomationsChecked = async (
  http: HttpApi,
  inputs: AutomationInput[],
): Promise<Automation[]> => {
  const risky = inputs.filter(usesNewFields);
  const previous = risky.length === 0 ? null : await http.call(api.automations.list, {});
  const stored = await http.call(api.automations.replace, { body: { automations: inputs } });
  if (previous === null || risky.every((input) => keeps(input, counterpartOf(input, stored)))) {
    return stored;
  }
  await http
    .call(api.automations.replace, { body: { automations: previous.map(inputOf) } })
    .catch(() => undefined);
  throw new MailClientError({ code: 'not_implemented', message: OUTDATED_AUTOMATIONS });
};

export const outdatedPreview = (error: unknown): unknown =>
  error instanceof MailClientError && error.status === 404
    ? new MailClientError({ code: 'not_implemented', message: OUTDATED_PREVIEW }, 404)
    : error;
