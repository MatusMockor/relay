import type { AutomationInput } from '@relay/shared/api';
import type { Automation, AutomationId, UserId } from '@relay/shared/domain';

export const storedAutomationOf = (
  input: AutomationInput,
  id: AutomationId,
  userId: UserId,
  existing: Automation | undefined,
): Automation => ({
  ...input,
  id,
  userId,
  preset: existing?.preset ?? null,
  match: input.match ?? existing?.match ?? 'all',
  exceptions: input.exceptions ?? existing?.exceptions ?? [],
});

export const inputRules = (input: AutomationInput) => ({
  kind: 'Automation',
  name: input.name,
  rules: [...input.conditions, ...(input.exceptions ?? [])],
});
