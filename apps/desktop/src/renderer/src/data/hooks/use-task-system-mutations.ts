import type {
  ConnectTaskSystemInput,
  TaskSystemConnection,
  TaskSystemConnectionId,
} from '@relay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useClient } from './services-context';
import { taskSystemKeys } from './task-system-keys';

const upsert = (
  connections: readonly TaskSystemConnection[] | undefined,
  connection: TaskSystemConnection,
): TaskSystemConnection[] => [
  ...(connections ?? []).filter((item) => item.id !== connection.id),
  connection,
];

export interface TaskSystemConnector {
  readonly isPending: boolean;
  connect(input: ConnectTaskSystemInput): Promise<TaskSystemConnection>;
}

export const useConnectTaskSystem = (): TaskSystemConnector => {
  const client = useClient();
  const queryClient = useQueryClient();
  const [isPending, setPending] = useState(false);
  const connect = async (input: ConnectTaskSystemInput): Promise<TaskSystemConnection> => {
    setPending(true);
    try {
      const connection = await client.connectTaskSystem(input);
      queryClient.setQueryData<TaskSystemConnection[]>(taskSystemKeys.connections(), (current) =>
        upsert(current, connection),
      );
      void queryClient.invalidateQueries({ queryKey: taskSystemKeys.connections() });
      void queryClient.invalidateQueries({ queryKey: taskSystemKeys.tasks(connection.id) });
      return connection;
    } finally {
      setPending(false);
    }
  };
  return { isPending, connect };
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
