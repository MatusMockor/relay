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
import { storedAutomationOf } from './automation-input';

export interface AutomationReplacement {
  readonly automations: Automation[];
  readonly keep: AutomationId[];
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
  const keep: AutomationId[] = [];
  items.forEach((item) => {
    if (!isKeepAutomationInput(item)) {
      automations.push(inputOf(item, context));
      return;
    }
    const stored = context.known.get(item.id);
    if (stored !== undefined) {
      automations.push(stored);
      return;
    }
    if (!unsupported.has(item.id)) {
      throw new ValidationError(`Unknown automation id ${item.id}`);
    }
    keep.push(item.id);
  });
  const ids = [...automations.map((automation) => automation.id), ...keep];
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
