import type { ThreadPage, ThreadSummary } from '@relay/shared';
import type { MailClient, ThreadListParams } from '../MailClient';

export const RANGE_PAGE_LIMIT = 50;

export interface ThreadRangeRequest {
  readonly params: ThreadListParams;
  readonly loaded: () => number;
  readonly signal?: AbortSignal;
}

export const rangeTargetOf = (page: ThreadPage | undefined): number => {
  if (page === undefined) {
    return 0;
  }
  return page.nextCursor === null ? Number.POSITIVE_INFINITY : page.items.length;
};

const collect = (found: Map<string, ThreadSummary>, page: ThreadPage): void => {
  page.items.forEach((item) => {
    found.set(item.id, item);
  });
};

export const fetchThreadRange = async (
  client: MailClient,
  { params, loaded, signal }: ThreadRangeRequest,
): Promise<ThreadPage> => {
  const found = new Map<string, ThreadSummary>();
  let page = await client.listThreads(params);
  let pages = 1;
  collect(found, page);
  while (
    page.nextCursor !== null &&
    found.size < loaded() &&
    pages < RANGE_PAGE_LIMIT &&
    signal?.aborted !== true
  ) {
    page = await client.listThreads({ ...params, cursor: page.nextCursor });
    pages += 1;
    collect(found, page);
  }
  return { items: [...found.values()], nextCursor: page.nextCursor };
};
