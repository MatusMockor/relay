import type { SplitPreviewBody } from '@relay/shared';
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export const useSplitPreview = (body: SplitPreviewBody | null) => {
  const client = useClient();
  return useQuery({
    queryKey: queryKeys.splitPreview(body),
    queryFn: body === null ? skipToken : () => client.previewSplit(body),
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
};
