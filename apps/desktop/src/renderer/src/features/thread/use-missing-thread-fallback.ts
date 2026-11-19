import type { ThreadId } from '@relay/shared';
import { useEffect } from 'react';
import { isNotFound } from '../../data/errors';
import { setUi } from '../../state/ui-store';
import { appHistory } from '../history/app-history';

export const useMissingThreadFallback = (threadId: ThreadId | null, error: unknown): void => {
  const missing = isNotFound(error);
  useEffect(() => {
    if (!missing || threadId === null) {
      return;
    }
    appHistory.quietly(() => {
      setUi((state) =>
        state.openThreadId === threadId ? { openThreadId: null, reply: null } : {},
      );
    });
  }, [missing, threadId]);
};
