import type { AccountId, AutomationCondition } from '@relay/shared';
import { Button } from '@relay/ui';
import { useSplits } from '../../data/hooks/use-mail-queries';
import { SplitFilingForm } from './SplitFilingForm';

export const SPLITS_LOADING = 'Načítavam splity…';
export const SPLITS_FAILED = 'Splity sa nepodarilo načítať. Zavri okno a skús to znova.';

export interface SplitFilingProps {
  readonly accountId: AccountId;
  readonly conditions: readonly AutomationCondition[];
  readonly suggestedName: string;
  readonly onCancel: () => void;
  readonly onFiled: () => void;
}

export function SplitFiling({ onCancel, ...props }: SplitFilingProps) {
  const splits = useSplits();
  const entries = splits.data;
  if (entries !== undefined) {
    return (
      <section className="rfm-split" aria-label="Zaradiť do splitu">
        <SplitFilingForm entries={entries} onCancel={onCancel} {...props} />
      </section>
    );
  }
  return (
    <section className="rfm-split" aria-label="Zaradiť do splitu">
      <p className="rfm-lead" role="status">
        {splits.isError ? SPLITS_FAILED : SPLITS_LOADING}
      </p>
      <footer className="rfm-foot">
        <Button onClick={onCancel}>Späť</Button>
        <Button variant="primary" disabled>
          Zaradiť
        </Button>
      </footer>
    </section>
  );
}
