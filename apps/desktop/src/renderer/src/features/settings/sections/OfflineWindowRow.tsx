import type { OfflineWindow } from '@relay/shared';
import { Segmented } from '@relay/ui';
import { useOfflineStats } from '../../../data/hooks/use-offline-stats';
import { SettingRow } from '../SettingRow';
import { formatCount } from './history-summary';
import { useOfflineWindow } from './use-offline-window';

const OPTIONS: readonly { readonly value: OfflineWindow; readonly label: string }[] = [
  { value: '3m', label: '3 mesiace' },
  { value: '6m', label: '6 mesiacov' },
  { value: '1y', label: '1 rok' },
  { value: '5y', label: '5 rokov' },
  { value: 'all', label: 'Všetko' },
];

const DESCRIPTION =
  'Staršie maily ostanú v zozname a otvoria sa zo servera. Prílohy sa sťahujú vždy na požiadanie.';

export function OfflineWindowRow() {
  const [selected, choose] = useOfflineWindow();
  const stats = useOfflineStats();
  const stored = stats.data?.local ?? 0;
  return (
    <SettingRow
      title="Uchovávať offline"
      description={
        <>
          {DESCRIPTION}
          {stored === 0 ? null : (
            <span className="offline-stats"> Offline uložené: {formatCount(stored)} správ</span>
          )}
        </>
      }
      stacked
    >
      <Segmented<OfflineWindow>
        label="Uchovávať offline"
        value={selected}
        options={OPTIONS}
        onChange={choose}
      />
    </SettingRow>
  );
}
