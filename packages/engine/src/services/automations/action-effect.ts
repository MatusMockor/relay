import type { AutomationActivityAction } from '@relay/shared/domain';
import type { TrackedChange } from '../actions/message-changes';

export type ActionEffect = Pick<
  AutomationActivityAction,
  'changed' | 'previousState' | 'origins' | 'labelled'
>;

export const NO_EFFECT: ActionEffect = {
  changed: [],
  previousState: null,
  origins: [],
  labelled: [],
};

export const trackedEffect = ({
  written,
  previousState,
  origins,
  labelled,
}: TrackedChange): ActionEffect => ({
  changed: [...written],
  previousState,
  origins: [...origins],
  labelled: [...labelled],
});
