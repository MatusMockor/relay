import type { AccountId, ThreadId, ThreadPage } from '@relay/shared';
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskListParams, ThreadListParams } from '../MailClient';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';
import { fetchThreadRange, rangeTargetOf } from './thread-range';
import { removalMark, withoutRemovedSince } from './thread-tombstones';

export const LIST_LIMIT = 200;

export const threadListParams = (params: ThreadListParams): ThreadListParams => ({
  limit: LIST_LIMIT,
  ...params,
});

export const useThreadList = (params: ThreadListParams, enabled = true) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const full = threadListParams(params);
  const queryKey = queryKeys.threadList(full);
  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const mark = removalMark(queryClient);
      const range = await fetchThreadRange(client, {
        params: full,
        loaded: () => rangeTargetOf(queryClient.getQueryData<ThreadPage>(queryKey)),
        signal,
      });
      return withoutRemovedSince(queryClient, mark, range);
    },
    placeholderData: keepPreviousData,
    enabled,
  });
};

export const useThreadDetail = (threadId: ThreadId | null) => {
  const client = useClient();
  return useQuery({
    queryKey:
      threadId === null ? ['mail', 'threads', 'detail', 'none'] : queryKeys.thread(threadId),
    queryFn: () => (threadId === null ? null : client.getThread(threadId)),
    enabled: threadId !== null,
  });
};

export const useAccounts = () => {
  const client = useClient();
  return useQuery({ queryKey: queryKeys.accounts(), queryFn: () => client.listAccounts() });
};

export const useLabels = () => {
  const client = useClient();
  return useQuery({ queryKey: queryKeys.labels(), queryFn: () => client.listLabels() });
};

export const useMailboxes = (accountId: AccountId | null) => {
  const client = useClient();
  return useQuery({
    queryKey: accountId === null ? ['mail', 'mailboxes', 'none'] : queryKeys.mailboxes(accountId),
    queryFn: () => (accountId === null ? [] : client.listMailboxes(accountId)),
    enabled: accountId !== null,
  });
};

export const useAccountsMailboxes = (accountIds: readonly AccountId[]) => {
  const client = useClient();
  return useQueries({
    queries: accountIds.map((accountId) => ({
      queryKey: queryKeys.mailboxes(accountId),
      queryFn: () => client.listMailboxes(accountId),
    })),
  });
};

export const useSplits = () => {
  const client = useClient();
  return useQuery({ queryKey: queryKeys.splits(), queryFn: () => client.listSplits() });
};

export const useTasks = (params: TaskListParams = {}) => {
  const client = useClient();
  const full = { limit: LIST_LIMIT, ...params };
  return useQuery({ queryKey: queryKeys.tasks(full), queryFn: () => client.listTasks(full) });
};

export const useDrafts = () => {
  const client = useClient();
  return useQuery({ queryKey: queryKeys.drafts(), queryFn: () => client.listDrafts() });
};

export const useScheduled = () => {
  const client = useClient();
  return useQuery({ queryKey: queryKeys.scheduled(), queryFn: () => client.listScheduled() });
};

export const useUserSettings = () => {
  const client = useClient();
  return useQuery({ queryKey: queryKeys.settings(), queryFn: () => client.getSettings() });
};

export const useAiRunners = () => {
  const client = useClient();
  return useQuery({
    queryKey: queryKeys.runners(),
    queryFn: () => client.listAiRunners(),
    staleTime: 60_000,
  });
};

export const useAutomations = () => {
  const client = useClient();
  return useQuery({ queryKey: queryKeys.automations(), queryFn: () => client.listAutomations() });
};
