import type { ThreadId } from '@relay/shared';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { MailClient } from '../../data/MailClient';
import { queryKeys } from '../../data/hooks/query-keys';
import { findKnownThread } from '../../data/hooks/thread-cache';
import { useAppContext, useClient } from '../../data/hooks/services-context';
import { type OverlayState, useUiStore } from '../../state/ui-store';
import { openThreadAt, relocateOpenedThread } from './place-thread';
import { placementOf, type ThreadPlacement } from './thread-placement';

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

const relocateOnceLoaded = (
  queryClient: QueryClient,
  client: MailClient,
  threadId: ThreadId,
  fallback: ThreadPlacement,
  tag: symbol,
): void => {
  queryClient
    .fetchQuery({ queryKey: queryKeys.thread(threadId), queryFn: () => client.getThread(threadId) })
    .then(
      (detail) => {
        relocateOpenedThread(tag, placementOf(detail.thread, fallback.scope));
      },
      () => {
        relocateOpenedThread(tag, fallback);
      },
    );
};

export const useNotificationNavigation = (): void => {
  const { platform } = useAppContext();
  const client = useClient();
  const queryClient = useQueryClient();
  useEffect(
    () =>
      platform.subscribeToThreadOpens((threadId) => {
        const { overlay, scope } = useUiStore.getState();
        const known = findKnownThread(queryClient, threadId);
        const placement = placementOf(known, scope);
        const extra = closesOnThreadOpen(overlay) ? { overlay: null } : {};
        if (known !== null) {
          openThreadAt(threadId, placement, extra);
          return;
        }
        const tag = Symbol(threadId);
        openThreadAt(threadId, placement, extra, tag);
        relocateOnceLoaded(queryClient, client, threadId, placement, tag);
      }),
    [platform, client, queryClient],
  );
};
