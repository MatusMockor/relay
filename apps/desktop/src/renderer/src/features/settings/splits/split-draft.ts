import { type AutomationConditionType, SPLIT_RULE_TYPES } from '@relay/shared';
import type { SplitDraft } from '../../../data/split-input';

export type { SplitDraft } from '../../../data/split-input';

export type SplitChange = Partial<SplitDraft>;

export const SPLIT_CONDITION_TYPES: readonly AutomationConditionType[] = SPLIT_RULE_TYPES;

export const missingRule = (draft: SplitDraft): string | null =>
  draft.rules.length === 0 ? 'Pridaj aspoň jednu podmienku, potom sa split uloží.' : null;
