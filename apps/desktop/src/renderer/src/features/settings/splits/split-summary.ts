import { conditionPhrase, joinPhrases } from '../automations/rule-phrases';
import { MATCH_JOINERS } from '../automations/rule-summary';
import type { SplitDraft } from './split-draft';

export const describeSplit = (draft: SplitDraft, accountName: string | null): string => {
  if (draft.rules.length === 0) {
    return 'Split zatiaľ nemá žiadnu podmienku.';
  }
  const where = accountName === null ? '' : ` z účtu ${accountName}`;
  const rules = joinPhrases(draft.rules.map(conditionPhrase), MATCH_JOINERS[draft.match]);
  const exceptions =
    draft.exceptions.length === 0
      ? ''
      : `, okrem mailov ${joinPhrases(draft.exceptions.map(conditionPhrase), 'alebo')}`;
  return `Do splitu ${draft.name} pôjdu maily${where} ${rules}${exceptions}.`;
};
