import type { AutomationCriteria } from './automation-criteria';
import type { Split } from './split';

export const splitCriteria = (
  split: Pick<Split, 'match' | 'rules' | 'exceptions'>,
): AutomationCriteria => ({
  match: split.match,
  conditions: split.rules,
  exceptions: split.exceptions,
});
