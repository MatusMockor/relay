import { useEffect } from 'react';
import { type EditableRule, isStaged } from '../editable-rule';

export const useStagedCleanup = (
  rules: readonly EditableRule[],
  openKey: string | null,
  discard: (key: string) => void,
): void => {
  const stale = rules
    .filter((rule) => isStaged(rule) && rule.key !== openKey)
    .map((rule) => rule.key)
    .join('\n');
  useEffect(() => {
    if (stale === '') {
      return;
    }
    stale.split('\n').forEach(discard);
  }, [stale, discard]);
};
