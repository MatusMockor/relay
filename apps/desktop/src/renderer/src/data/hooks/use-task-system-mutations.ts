import type {
  ConnectTaskSystemInput,
  TaskSystemConnection,
  TaskSystemConnectionId,
} from '@relay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useClient } from './services-context';
import { taskSystemKeys } from './task-system-keys';

const upsert = (
  connections: readonly TaskSystemConnection[] | undefined,
  connection: TaskSystemConnection,
): TaskSystemConnection[] => [
  ...(connections ?? []).filter((item) => item.id !== connection.id),
  connection,
];

export const useConnectTaskSystem = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnectTaskSystemInput) => client.connectTaskSystem(input),
    onSuccess: async (connection) => {
      queryClient.setQueryData<TaskSystemConnection[]>(taskSystemKeys.connections(), (current) =>
        upsert(current, connection),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: taskSystemKeys.connections() }),
        queryClient.invalidateQueries({ queryKey: taskSystemKeys.tasks(connection.id) }),
      ]);
    },
  });
};

export const useDisconnectTaskSystem = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: TaskSystemConnectionId) => client.disconnectTaskSystem(connectionId),
    onSuccess: async (_result, connectionId) => {
      queryClient.setQueryData<TaskSystemConnection[]>(taskSystemKeys.connections(), (current) =>
        current?.filter((connection) => connection.id !== connectionId),
      );
      queryClient.removeQueries({ queryKey: taskSystemKeys.tasks(connectionId) });
      await queryClient.invalidateQueries({ queryKey: taskSystemKeys.connections() });
    },
  });
};
