import type { ThreadPage } from '@relay/shared';

export const appendPage = (
  existing: ThreadPage | undefined,
  page: ThreadPage,
  cursor: string,
): ThreadPage | undefined => {
  if (existing === undefined || existing.nextCursor !== cursor) {
    return existing;
  }
  const known = new Set(existing.items.map((item) => item.id));
  return {
    items: [...existing.items, ...page.items.filter((item) => !known.has(item.id))],
    nextCursor: page.nextCursor,
  };
};
