import type { AutomationPreviewBody } from '@relay/shared';
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export const useAutomationPreview = (body: AutomationPreviewBody | null) => {
  const client = useClient();
  return useQuery({
    queryKey: queryKeys.automationPreview(body),
    queryFn: body === null ? skipToken : () => client.previewAutomation(body),
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
};
