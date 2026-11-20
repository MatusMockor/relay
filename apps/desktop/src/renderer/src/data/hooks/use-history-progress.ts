import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export const useHistoryProgress = () => {
  const client = useClient();
  return useQuery({
    queryKey: queryKeys.historyProgress(),
    queryFn: () => client.historyProgress(),
    enabled: client.kind !== 'remote',
  });
};
