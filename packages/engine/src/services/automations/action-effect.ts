import type { AutomationActivityAction } from '@relay/shared/domain';
import type { TrackedChange } from '../actions/message-changes';

export type ActionEffect = Pick<AutomationActivityAction, 'changed' | 'previousState' | 'origins'>;

export const NO_EFFECT: ActionEffect = { changed: [], previousState: null, origins: [] };

export const trackedEffect = ({
  written,
  previousState,
  origins,
}: TrackedChange): ActionEffect => ({
  changed: [...written],
  previousState,
  origins: [...origins],
});
