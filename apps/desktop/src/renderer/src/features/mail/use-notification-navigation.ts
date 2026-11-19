import type { ThreadId } from '@relay/shared';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { MailClient } from '../../data/MailClient';
import { queryKeys } from '../../data/hooks/query-keys';
import { findKnownThread } from '../../data/hooks/thread-cache';
import { useAppContext, useClient } from '../../data/hooks/services-context';
import { type OverlayState, setUi, useUiStore } from '../../state/ui-store';
import { openThreadAt, relocateOpenThread } from './place-thread';
import { placementOf } from './thread-placement';

const CLOSABLE_OVERLAYS: ReadonlySet<OverlayState['kind']> = new Set([
  'palette',
  'shortcuts',
  'settings',
  'remind',
  'accounts',
]);

const closesOnThreadOpen = (overlay: OverlayState | null): boolean => {
  if (overlay === null || !CLOSABLE_OVERLAYS.has(overlay.kind)) {
    return false;
  }
  return overlay.kind !== 'settings' || !overlay.adding;
};

const relocateOnceLoaded = (queryClient: QueryClient, client: MailClient, threadId: ThreadId) => {
  queryClient
    .fetchQuery({ queryKey: queryKeys.thread(threadId), queryFn: () => client.getThread(threadId) })
    .then((detail) => {
      relocateOpenThread(threadId, placementOf(detail.thread, useUiStore.getState().scope));
    })
    .catch(() => undefined);
};

export const useNotificationNavigation = (): void => {
  const { platform } = useAppContext();
  const client = useClient();
  const queryClient = useQueryClient();
  useEffect(
    () =>
      platform.subscribeToThreadOpens((threadId) => {
        if (closesOnThreadOpen(useUiStore.getState().overlay)) {
          setUi({ overlay: null });
        }
        const known = findKnownThread(queryClient, threadId);
        openThreadAt(threadId, placementOf(known, useUiStore.getState().scope));
        if (known !== null) {
          return;
        }
        relocateOnceLoaded(queryClient, client, threadId);
      }),
    [platform, client, queryClient],
  );
};
