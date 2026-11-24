import type { ThreadSummary } from '@relay/shared';
import { useRef } from 'react';
import { viewOf } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { priorityForCode } from './priority-keys';
import { useSetTaskPriority } from './use-set-task-priority';

const CHORD_WINDOW_MS = 1_500;

export interface PriorityChord {
  readonly arm: () => void;
  readonly consume: (
    event: KeyboardEvent,
    thread: ThreadSummary | null,
    claim: (run: () => void) => void,
  ) => boolean;
}

export const usePriorityChord = (): PriorityChord => {
  const armedAt = useRef(0);
  const setPriority = useSetTaskPriority();
  return {
    arm: () => {
      if (viewOf(useUiStore.getState().folder) === 'tasks') {
        armedAt.current = Date.now();
      }
    },
    consume: (event, thread, claim) => {
      if (armedAt.current === 0 || Date.now() - armedAt.current >= CHORD_WINDOW_MS) {
        armedAt.current = 0;
        return false;
      }
      armedAt.current = 0;
      const priority = priorityForCode(event.code);
      if (priority !== null && thread !== null) {
        claim(() => {
          setPriority(thread, priority);
        });
      }
      return true;
    },
  };
};
