import type { Automation, AutomationCondition } from './automation';

export type AutomationCriteria = Pick<Automation, 'match' | 'conditions' | 'exceptions'>;

export const matchesCriteria = (
  criteria: AutomationCriteria,
  test: (condition: AutomationCondition) => boolean,
): boolean => {
  if (criteria.conditions.length === 0) {
    return false;
  }
  const matched =
    criteria.match === 'any' ? criteria.conditions.some(test) : criteria.conditions.every(test);
  return matched && !criteria.exceptions.some(test);
};

const foldText = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('sk');

export const subjectContains = (subject: string, value: string): boolean => {
  const needle = foldText(value.trim());
  return needle !== '' && foldText(subject).includes(needle);
};
