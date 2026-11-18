import type { ThreadSummary } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { findCachedThread } from '../../data/hooks/thread-cache';
import { useAppContext } from '../../data/hooks/services-context';
import { type Folder, INBOX } from '../../state/folders';
import { type OverlayState, setUi, useUiStore } from '../../state/ui-store';
import { openThread, selectFolder } from './navigation';

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

const folderOfThread = (thread: ThreadSummary | null): Folder => {
  const splitId = thread?.state === 'inbox' ? thread.splitIds[0] : undefined;
  return splitId === undefined ? INBOX : { kind: 'inbox', splitId };
};

export const useNotificationNavigation = (): void => {
  const { platform } = useAppContext();
  const queryClient = useQueryClient();
  useEffect(
    () =>
      platform.subscribeToThreadOpens((threadId) => {
        if (closesOnThreadOpen(useUiStore.getState().overlay)) {
          setUi({ overlay: null });
        }
        selectFolder(folderOfThread(findCachedThread(queryClient, threadId)));
        openThread(threadId);
      }),
    [platform, queryClient],
  );
};
