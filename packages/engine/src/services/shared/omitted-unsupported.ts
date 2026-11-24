import { ValidationError } from '../../errors';

interface Placed<Id extends string> {
  readonly id: Id;
  readonly order: number;
}

export const withOmittedUnsupported = <Id extends string>(
  placed: { readonly written: number; readonly keep: readonly Placed<Id>[] },
  unsupported: readonly Placed<Id>[],
  limit: { readonly max: number; readonly what: string },
): Placed<Id>[] => {
  const kept = new Set(placed.keep.map(({ id }) => id));
  const start = placed.written + placed.keep.length;
  const omitted = unsupported
    .filter((entry) => !kept.has(entry.id))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((entry, index) => ({ id: entry.id, order: start + index }));
  if (start + omitted.length > limit.max) {
    throw new ValidationError(`At most ${String(limit.max)} ${limit.what} are allowed`);
  }
  return [...placed.keep, ...omitted];
};
