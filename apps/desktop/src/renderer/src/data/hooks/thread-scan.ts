import type { ThreadPage, ThreadSummary } from '@relay/shared';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import type { MailClient, ThreadListParams } from '../MailClient';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';
import { LIST_LIMIT } from './use-mail-queries';

export const SCAN_PAGE_LIMIT = 10;
export const SCAN_THREAD_LIMIT = 500;

export type ThreadScanParams = Omit<ThreadListParams, 'cursor' | 'limit'>;

export const scanThreads = async (
  client: MailClient,
  params: ThreadScanParams,
): Promise<ThreadPage> => {
  const found = new Map<string, ThreadSummary>();
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await client.listThreads({ ...params, limit: LIST_LIMIT, cursor });
    page.items.forEach((item) => found.set(item.id, item));
    cursor = page.nextCursor ?? undefined;
    pages += 1;
  } while (cursor !== undefined && pages < SCAN_PAGE_LIMIT && found.size < SCAN_THREAD_LIMIT);
  return { items: [...found.values()].slice(0, SCAN_THREAD_LIMIT), nextCursor: cursor ?? null };
};

const scanQuery = (client: MailClient, params: ThreadScanParams) => ({
  queryKey: queryKeys.threadScan(params),
  queryFn: () => scanThreads(client, params),
  placeholderData: keepPreviousData,
});

export const useThreadScan = (params: ThreadScanParams) => useQuery(scanQuery(useClient(), params));

export const useThreadScans = (params: readonly ThreadScanParams[]) => {
  const client = useClient();
  return useQueries({ queries: params.map((entry) => scanQuery(client, entry)) });
};
