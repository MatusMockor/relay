import type { Automation, AutomationInput } from '@relay/shared';
import { MailClientError } from '../errors';

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
  automation.match === (input.match ?? 'all') &&
  automation.exceptions.length === (input.exceptions?.length ?? 0);

export const assertAutomationsKept = (
  inputs: readonly AutomationInput[],
  stored: readonly Automation[],
): Automation[] => {
  if (inputs.some((input) => usesNewFields(input) && !keeps(input, counterpartOf(input, stored)))) {
    throw new MailClientError({ code: 'not_implemented', message: OUTDATED_AUTOMATIONS });
  }
  return [...stored];
};

export const outdatedPreview = (error: unknown): unknown =>
  error instanceof MailClientError && error.status === 404
    ? new MailClientError({ code: 'not_implemented', message: OUTDATED_PREVIEW }, 404)
    : error;
