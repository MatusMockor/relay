import { useMemo } from 'react';
import { useAccounts, useLabels } from '../../data/hooks/use-mail-queries';
import { createNameColors, type NameColors } from './name-colors';

let remembered: ReadonlyMap<string, string> = new Map();

export const useNameColors = (): NameColors => {
  const accounts = useAccounts().data;
  const labels = useLabels().data;
  return useMemo(() => {
    const colors = createNameColors(
      (accounts ?? []).map((account) => ({ name: account.displayName, color: account.color })),
      labels ?? [],
      remembered,
    );
    remembered = colors.labelHues;
    return colors;
  }, [accounts, labels]);
};
