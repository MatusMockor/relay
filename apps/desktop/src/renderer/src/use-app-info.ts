import type { RelayBridge } from '@relay/shared/ipc';
import { useQuery } from '@tanstack/react-query';

export const useAppInfo = (bridge: RelayBridge | null) =>
  useQuery({
    queryKey: ['app', 'info'],
    enabled: bridge !== null,
    queryFn: async () => {
      if (bridge === null) {
        return null;
      }
      const result = await bridge.invoke('app.getInfo');
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
  });
