import type { ThreadSummary } from '@relay/shared';
import { useEffect, useRef } from 'react';
import { viewOf } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { priorityForCode } from './priority-keys';
import { useSetTaskPriority } from './use-set-task-priority';

const CHORD_WINDOW_MS = 1_500;
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

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
  useEffect(
    () =>
      useUiStore.subscribe((state, previous) => {
        if (
          state.folder !== previous.folder ||
          state.selected !== previous.selected ||
          state.openThreadId !== previous.openThreadId ||
          state.overlay !== previous.overlay
        ) {
          armedAt.current = 0;
        }
      }),
    [],
  );
  return {
    arm: () => {
      if (viewOf(useUiStore.getState().folder) === 'tasks') {
        armedAt.current = Date.now();
      }
    },
    consume: (event, thread, claim) => {
      if (MODIFIER_KEYS.has(event.key)) {
        return false;
      }
      const armed = armedAt.current > 0 && Date.now() - armedAt.current < CHORD_WINDOW_MS;
      armedAt.current = 0;
      const priority = priorityForCode(event.code);
      if (!armed || priority === null) {
        return false;
      }
      claim(() => {
        if (thread !== null) {
          setPriority(thread, priority);
        }
      });
      return true;
    },
  };
};
