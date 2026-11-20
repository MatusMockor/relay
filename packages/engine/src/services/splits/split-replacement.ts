import { isKeepSplitInput, type SplitInput, type SplitReplaceItem } from '@relay/shared/api';
import type { Split, SplitEntry, SplitId, UnsupportedSplit, UserId } from '@relay/shared/domain';
import { ValidationError } from '../../errors';
import type { KeptSplit } from '../../ports/split-repository';

export interface SplitReplacementContext {
  readonly userId: UserId;
  readonly known: ReadonlyMap<string, Split>;
  readonly unsupported: readonly UnsupportedSplit[];
  readonly newId: () => SplitId;
}

export interface SplitReplacement {
  readonly splits: Split[];
  readonly keep: KeptSplit[];
}

type Resolved = { readonly split: Split } | { readonly kept: KeptSplit };

const storedSplitOf = (input: SplitInput, context: SplitReplacementContext): Split => {
  if (input.id !== undefined && !context.known.has(input.id)) {
    throw new ValidationError(`Unknown split id ${input.id}`);
  }
  const existing = input.id === undefined ? undefined : context.known.get(input.id);
  return {
    ...input,
    id: input.id ?? context.newId(),
    userId: context.userId,
    match: input.match ?? existing?.match ?? 'any',
    exceptions: input.exceptions ?? existing?.exceptions ?? [],
  };
};

const itemOf = (
  item: SplitReplaceItem,
  index: number,
  context: SplitReplacementContext,
): Resolved => {
  if (!isKeepSplitInput(item)) {
    return { split: storedSplitOf(item, context) };
  }
  const stored = context.known.get(item.id);
  if (stored !== undefined) {
    return { split: { ...stored, order: index } };
  }
  if (!context.unsupported.some((entry) => entry.id === item.id)) {
    throw new ValidationError(`Unknown split id ${item.id}`);
  }
  return { kept: { id: item.id, order: index } };
};

const idOf = (resolved: Resolved): string =>
  'split' in resolved ? resolved.split.id : resolved.kept.id;

const orderOf = (resolved: Resolved): number =>
  'split' in resolved ? resolved.split.order : resolved.kept.order;

export const resolveSplits = (
  items: readonly SplitReplaceItem[],
  context: SplitReplacementContext,
): SplitReplacement => {
  const resolved = items.map((item, index) => ({ item: itemOf(item, index, context), index }));
  if (new Set(resolved.map(({ item }) => idOf(item))).size !== resolved.length) {
    throw new ValidationError('Split ids must be unique');
  }
  const sorted = resolved.sort(
    (left, right) => orderOf(left.item) - orderOf(right.item) || left.index - right.index,
  );
  const splits: Split[] = [];
  const keep: KeptSplit[] = [];
  sorted.forEach(({ item }, order) => {
    if ('split' in item) {
      splits.push({ ...item.split, order });
      return;
    }
    keep.push({ id: item.kept.id, order });
  });
  return { splits, keep };
};

export const withUnsupportedSplits = (
  splits: readonly Split[],
  unsupported: readonly UnsupportedSplit[],
): SplitEntry[] =>
  [...splits, ...unsupported].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
