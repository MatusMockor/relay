import {
  type AutomationInput,
  type AutomationReplaceItem,
  isKeepAutomationInput,
  MAX_AUTOMATIONS,
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
import { withOmittedUnsupported } from '../shared/omitted-unsupported';
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

interface Positioned {
  readonly id: string;
  readonly order: number;
  readonly index: number;
}

const positionsOf = (
  automations: readonly Automation[],
  keep: readonly KeptAutomation[],
  listIndex: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> => {
  const all: Positioned[] = [...automations, ...keep].map((entry) => ({
    id: entry.id,
    order: entry.order,
    index: listIndex.get(entry.id) ?? 0,
  }));
  const sorted = [...all].sort(
    (left, right) => left.order - right.order || left.index - right.index,
  );
  return new Map(sorted.map((entry, position) => [entry.id, position]));
};

const renumbered = (
  automations: readonly Automation[],
  keep: readonly KeptAutomation[],
  listIndex: ReadonlyMap<string, number>,
): AutomationReplacement => {
  const positions = positionsOf(automations, keep, listIndex);
  const at = (id: string): number => positions.get(id) ?? 0;
  return {
    automations: automations.map((automation) => ({ ...automation, order: at(automation.id) })),
    keep: keep.map((kept) => ({ ...kept, order: at(kept.id) })),
  };
};

export const resolveReplacement = (
  items: readonly AutomationReplaceItem[],
  context: ReplacementContext,
): AutomationReplacement => {
  const unsupported = new Set(context.unsupported.map((entry) => entry.id));
  const automations: Automation[] = [];
  const keep: KeptAutomation[] = [];
  const listIndex = new Map<string, number>();
  items.forEach((item, order) => {
    if (!isKeepAutomationInput(item)) {
      const automation = inputOf(item, context);
      listIndex.set(automation.id, order);
      automations.push(automation);
      return;
    }
    listIndex.set(item.id, order);
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
  const replacement = renumbered(automations, keep, listIndex);
  return {
    automations: replacement.automations,
    keep: withOmittedUnsupported(
      { written: replacement.automations.length, keep: replacement.keep },
      context.unsupported,
      { max: MAX_AUTOMATIONS, what: 'automations' },
    ),
  };
};

export const withUnsupported = (
  automations: readonly Automation[],
  unsupported: readonly UnsupportedAutomation[],
): AutomationEntry[] =>
  [...automations, ...unsupported].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
