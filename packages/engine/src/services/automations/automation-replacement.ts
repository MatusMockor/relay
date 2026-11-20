import {
  type AutomationInput,
  type AutomationReplaceItem,
  isKeepAutomationInput,
} from '@relay/shared/api';
import type {
  Automation,
  AutomationEntry,
  AutomationId,
  UnsupportedAutomation,
  UserId,
} from '@relay/shared/domain';
import { ValidationError } from '../../errors';
import type { KeptAutomation } from '../../ports/automation-repository';
import { storedAutomationOf } from './automation-input';

export interface AutomationReplacement {
  readonly automations: Automation[];
  readonly keep: KeptAutomation[];
}

export interface ReplacementContext {
  readonly userId: UserId;
  readonly known: ReadonlyMap<string, Automation>;
  readonly unsupported: readonly UnsupportedAutomation[];
  readonly newId: () => AutomationId;
}

const inputOf = (input: AutomationInput, context: ReplacementContext): Automation => {
  if (input.id !== undefined && !context.known.has(input.id)) {
    throw new ValidationError(`Unknown automation id ${input.id}`);
  }
  const existing = input.id === undefined ? undefined : context.known.get(input.id);
  return storedAutomationOf(input, input.id ?? context.newId(), context.userId, existing);
};

export const resolveReplacement = (
  items: readonly AutomationReplaceItem[],
  context: ReplacementContext,
): AutomationReplacement => {
  const unsupported = new Set(context.unsupported.map((entry) => entry.id));
  const automations: Automation[] = [];
  const keep: KeptAutomation[] = [];
  items.forEach((item, order) => {
    if (!isKeepAutomationInput(item)) {
      automations.push(inputOf(item, context));
      return;
    }
    const stored = context.known.get(item.id);
    if (stored !== undefined) {
      automations.push({ ...stored, order });
      return;
    }
    if (!unsupported.has(item.id)) {
      throw new ValidationError(`Unknown automation id ${item.id}`);
    }
    keep.push({ id: item.id, order });
  });
  const ids = [...automations.map((automation) => automation.id), ...keep.map(({ id }) => id)];
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError('Automation ids must be unique');
  }
  return { automations, keep };
};

export const withUnsupported = (
  automations: readonly Automation[],
  unsupported: readonly UnsupportedAutomation[],
): AutomationEntry[] =>
  [...automations, ...unsupported].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
