import type { ThreadPage } from '@relay/shared';

export const mergeHeadPage = (existing: ThreadPage | undefined, head: ThreadPage): ThreadPage => {
  const boundary = head.items.at(-1);
  if (existing === undefined || head.nextCursor === null || boundary === undefined) {
    return head;
  }
  const index = existing.items.findIndex((item) => item.id === boundary.id);
  if (index < 0 || index === existing.items.length - 1) {
    return head;
  }
  const inHead = new Set(head.items.map((item) => item.id));
  const tail = existing.items.slice(index + 1).filter((item) => !inHead.has(item.id));
  return { items: [...head.items, ...tail], nextCursor: existing.nextCursor };
};

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
