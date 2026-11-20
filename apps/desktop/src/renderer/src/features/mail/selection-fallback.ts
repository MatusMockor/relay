import type { ListItem } from './list-items';

const firstSurvivor = (
  candidates: readonly ListItem[],
  present: ReadonlySet<string>,
): string | null => candidates.find((item) => present.has(item.key))?.key ?? null;

export const replacementKeyOf = (
  removedKey: string,
  previous: readonly ListItem[],
  items: readonly ListItem[],
): string | null => {
  const index = previous.findIndex((item) => item.key === removedKey);
  if (index < 0) {
    return null;
  }
  const present = new Set(items.map((item) => item.key));
  return (
    firstSurvivor(previous.slice(index + 1), present) ??
    firstSurvivor(previous.slice(0, index).reverse(), present)
  );
};
