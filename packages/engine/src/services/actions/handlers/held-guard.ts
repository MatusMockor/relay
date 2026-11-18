import { type HeldThreadState, isHeldThreadState } from '@relay/shared/domain';
import { ValidationError } from '../../../errors';
import type { StateMovePlanner } from './state-move-plan';

const HELD_REASONS: Readonly<Record<HeldThreadState, string>> = {
  trash: 'Konverzácia je v koši, najprv ju obnov.',
  spam: 'Konverzácia je v spame, najprv ju označ ako Nie je spam.',
};

export const outsideHeld =
  (planner: StateMovePlanner): StateMovePlanner =>
  (messages, thread, copies) => {
    if (isHeldThreadState(thread.state)) {
      throw new ValidationError(HELD_REASONS[thread.state]);
    }
    return planner(messages, thread, copies);
  };
