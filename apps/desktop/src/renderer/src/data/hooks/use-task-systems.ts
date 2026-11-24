import type { ExternalTaskList, TaskSystemConnection, TaskSystemConnectionId } from '@relay/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import { MailClientError } from '../errors';
import type { MailClient } from '../MailClient';
import { useClient } from './services-context';
import { taskSystemKeys } from './task-system-keys';

const TASKS_STALE_MS = 60_000;
const TASKS_REFETCH_MS = 5 * 60_000;
const FINAL_CODES = new Set(['forbidden', 'not_found', 'validation_failed']);

const retryTasks = (failures: number, error: Error): boolean =>
  failures < 1 && !(error instanceof MailClientError && FINAL_CODES.has(error.code));

const tasksQuery = (client: MailClient, connectionId: TaskSystemConnectionId) => ({
  queryKey: taskSystemKeys.tasks(connectionId),
  queryFn: (): Promise<ExternalTaskList> => client.listTaskSystemTasks(connectionId),
  staleTime: TASKS_STALE_MS,
  refetchInterval: TASKS_REFETCH_MS,
  refetchOnWindowFocus: true,
  retry: retryTasks,
});

export const useTaskSystemConnections = () => {
  const client = useClient();
  return useQuery({
    queryKey: taskSystemKeys.connections(),
    queryFn: () => client.listTaskSystems(),
    refetchOnWindowFocus: true,
  });
};

export const useTaskSystemConnection = (
  connectionId: TaskSystemConnectionId,
): TaskSystemConnection | undefined =>
  useTaskSystemConnections().data?.find((connection) => connection.id === connectionId);

export const useTaskSystemTasks = (connectionId: TaskSystemConnectionId) => {
  const client = useClient();
  return useQuery(tasksQuery(client, connectionId));
};

export const useTaskSystemTaskLists = (connections: readonly TaskSystemConnection[]) => {
  const client = useClient();
  return useQueries({
    queries: connections.map((connection) => ({
      ...tasksQuery(client, connection.id),
      enabled: connection.status === 'ok',
    })),
  });
};
