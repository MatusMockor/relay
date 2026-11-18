import type { UpdateStatus } from '@relay/shared';
import { useEffect, useState } from 'react';
import type { Platform } from '../../platform/Platform';
import { checkFeedback } from './check-feedback';
import { reportUpdateFailure } from './report-update-failure';
import { advanceCheck, IDLE_CHECK, PENDING_CHECK } from './update-check-state';

export const UPDATE_CHECK_FEEDBACK_MS = 4000;

export interface UpdateCheck {
  readonly feedback: string | null;
  readonly check: () => void;
}

export const useUpdateCheck = (platform: Platform, status: UpdateStatus | null): UpdateCheck => {
  const [state, setState] = useState(IDLE_CHECK);
  const [seen, setSeen] = useState(status);
  if (status !== seen) {
    setSeen(status);
    setState(advanceCheck(state, status));
  }
  const { settled } = state;
  useEffect(() => {
    if (settled === null) {
      return;
    }
    const timer = setTimeout(() => {
      setState(IDLE_CHECK);
    }, UPDATE_CHECK_FEEDBACK_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [settled]);
  const check = () => {
    setState(PENDING_CHECK);
    platform.checkForUpdates().catch((error: unknown) => {
      setState(IDLE_CHECK);
      reportUpdateFailure(error);
    });
  };
  return { feedback: checkFeedback(settled), check };
};
