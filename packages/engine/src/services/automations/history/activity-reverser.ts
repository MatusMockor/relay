import type {
  AutomationAction,
  AutomationActionOf,
  ThreadSummary,
  UserId,
} from '@relay/shared/domain';

export type ReversibleActionType = 'markRead' | 'pin' | 'addLabel' | 'moveTo' | 'archive';

export type ReverseOutcome = 'undone' | 'skipped';

export interface ActivityReverser<Type extends ReversibleActionType = ReversibleActionType> {
  reverse(
    userId: UserId,
    thread: ThreadSummary,
    action: AutomationActionOf<Type>,
  ): Promise<ReverseOutcome>;
}

export type ActivityReversers = {
  readonly [Type in ReversibleActionType]: ActivityReverser<Type>;
};

export const REVERSE_ORDER: readonly ReversibleActionType[] = [
  'archive',
  'moveTo',
  'addLabel',
  'pin',
  'markRead',
];

export const isReversible = (
  action: AutomationAction,
): action is AutomationActionOf<ReversibleActionType> =>
  (REVERSE_ORDER as readonly string[]).includes(action.type);

export const reverseRank = (action: AutomationAction): number =>
  isReversible(action) ? REVERSE_ORDER.indexOf(action.type) : REVERSE_ORDER.length;
