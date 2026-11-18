import { useMemo } from 'react';
import { useAccounts, useLabels } from '../../data/hooks/use-mail-queries';
import { createNameColors, type NameColors } from './name-colors';

export const useNameColors = (): NameColors => {
  const accounts = useAccounts().data;
  const labels = useLabels().data;
  return useMemo(
    () =>
      createNameColors(
        (accounts ?? []).map((account) => ({ name: account.displayName, color: account.color })),
        labels ?? [],
      ),
    [accounts, labels],
  );
};
