import type { ThreadPage, ThreadSummary } from '@relay/shared';
import type { MailClient, ThreadListParams } from '../MailClient';
import { lastPositionOf, type ThreadPosition, sortsAfter } from '../thread-order';

export const RANGE_PAGE_LIMIT = 50;

export interface ThreadRangeRequest {
  readonly params: ThreadListParams;
  readonly cached: () => ThreadPage | undefined;
  readonly signal?: AbortSignal;
}

const boundaries = new WeakMap<ThreadPage, ThreadPosition | null>();

const boundaryOf = (cached: ThreadPage): ThreadPosition | null => {
  if (boundaries.has(cached)) {
    return boundaries.get(cached) ?? null;
  }
  const boundary = lastPositionOf(cached.items);
  boundaries.set(cached, boundary);
  return boundary;
};

const coversCache = (
  found: Map<string, ThreadSummary>,
  last: ThreadSummary | undefined,
  cached: ThreadPage | undefined,
): boolean => {
  if (cached === undefined) {
    return true;
  }
  if (cached.nextCursor === null || found.size < cached.items.length) {
    return false;
  }
  const boundary = boundaryOf(cached);
  return boundary === null || last === undefined || !sortsAfter(boundary, last);
};

const withCachedTail = (
  found: Map<string, ThreadSummary>,
  page: ThreadPage,
  cached: ThreadPage | undefined,
): ThreadPage => {
  const items = [...found.values()];
  const last = page.items.at(-1);
  if (cached === undefined || last === undefined || coversCache(found, last, cached)) {
    return { items, nextCursor: page.nextCursor };
  }
  const tail = cached.items.filter((item) => !found.has(item.id) && sortsAfter(item, last));
  if (tail.length === 0) {
    return { items, nextCursor: page.nextCursor };
  }
  return { items: [...items, ...tail], nextCursor: cached.nextCursor };
};

const collect = (found: Map<string, ThreadSummary>, page: ThreadPage): void => {
  page.items.forEach((item) => {
    found.set(item.id, item);
  });
};

export const fetchThreadRange = async (
  client: MailClient,
  { params, cached, signal }: ThreadRangeRequest,
): Promise<ThreadPage> => {
  const found = new Map<string, ThreadSummary>();
  let page = await client.listThreads(params);
  let pages = 1;
  collect(found, page);
  while (
    page.nextCursor !== null &&
    !coversCache(found, page.items.at(-1), cached()) &&
    pages < RANGE_PAGE_LIMIT &&
    signal?.aborted !== true
  ) {
    page = await client.listThreads({ ...params, cursor: page.nextCursor });
    pages += 1;
    collect(found, page);
  }
  if (page.nextCursor === null) {
    return { items: [...found.values()], nextCursor: null };
  }
  return withCachedTail(found, page, cached());
};
