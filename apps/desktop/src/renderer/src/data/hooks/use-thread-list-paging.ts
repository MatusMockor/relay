import type { ThreadPage } from '@relay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { ThreadListParams } from '../MailClient';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';
import { appendPage } from './thread-pages';
import { threadListParams } from './use-mail-queries';

export interface ListPaging {
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly failed: boolean;
  readonly loadMore: () => void;
  readonly retry: () => void;
}

export const NO_PAGING: ListPaging = {
  hasMore: false,
  loadingMore: false,
  failed: false,
  loadMore: () => undefined,
  retry: () => undefined,
};

interface PageRequest {
  readonly params: ThreadListParams;
  readonly cursor: string;
}

export const useThreadListPaging = (params: ThreadListParams, page: ThreadPage | undefined) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const cursor = page?.nextCursor ?? null;
  const more = useMutation({
    mutationFn: (request: PageRequest) =>
      client.listThreads({ ...request.params, cursor: request.cursor }),
    onSuccess: (next, request) => {
      queryClient.setQueryData<ThreadPage>(queryKeys.threadList(request.params), (latest) =>
        appendPage(latest, next, request.cursor),
      );
    },
  });
  const pending = more.isPending && more.variables.cursor === cursor;
  const failed = more.isError && more.variables.cursor === cursor;
  const request = useCallback(
    (allowFailed: boolean) => {
      if (cursor === null || more.isPending || (failed && !allowFailed)) {
        return;
      }
      more.mutate({ params: threadListParams(params), cursor });
    },
    [cursor, failed, more, params],
  );
  const loadMore = useCallback(() => {
    request(false);
  }, [request]);
  const retry = useCallback(() => {
    request(true);
  }, [request]);
  return { hasMore: cursor !== null, loadingMore: pending, failed, loadMore, retry };
};
