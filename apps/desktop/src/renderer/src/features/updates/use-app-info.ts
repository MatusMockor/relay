import type { AppInfo } from '@relay/shared';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '../../data/hooks/services-context';

const APP_INFO_KEY = ['app', 'info'] as const;

export const useAppInfo = (): AppInfo | null => {
  const { platform } = useAppContext();
  const query = useQuery({
    queryKey: APP_INFO_KEY,
    queryFn: () => platform.appInfo(),
    staleTime: Infinity,
  });
  return query.data ?? null;
};
