import type { Page } from '@relay/engine';

export const toPage = <Row, Item>(
  rows: readonly Row[],
  limit: number,
  toItem: (row: Row) => Item,
  toCursor: (row: Row) => string,
): Page<Item> => {
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  const hasMore = rows.length > limit && last !== undefined;
  return {
    items: visible.map(toItem),
    nextCursor: hasMore ? toCursor(last) : null,
  };
};
