import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export const useOfflineStats = () => {
  const client = useClient();
  return useQuery({
    queryKey: queryKeys.offlineStats(),
    queryFn: () => client.offlineStats(),
    enabled: client.kind !== 'remote',
  });
};
