import { Button } from '@relay/ui';
import { useHistoryProgress } from '../../../data/hooks/use-history-progress';
import { SettingRow } from '../SettingRow';
import { summarizeHistory } from './history-summary';

const TITLE = 'Staršia pošta';

interface HistoryErrorRowProps {
  readonly retrying: boolean;
  readonly onRetry: () => void;
}

function HistoryErrorRow({ retrying, onRetry }: HistoryErrorRowProps) {
  return (
    <SettingRow title={TITLE} description="Priebeh sťahovania histórie sa nepodarilo načítať.">
      <Button disabled={retrying} onClick={onRetry}>
        {retrying ? 'Načítavam…' : 'Skúsiť znova'}
      </Button>
    </SettingRow>
  );
}

export function HistoryRow() {
  const progress = useHistoryProgress();
  if (progress.isError && progress.data === undefined) {
    return (
      <HistoryErrorRow
        retrying={progress.isFetching}
        onRetry={() => {
          void progress.refetch();
        }}
      />
    );
  }
  const summary = summarizeHistory(progress.data ?? []);
  if (summary === null) {
    return null;
  }
  return (
    <SettingRow title={TITLE} description={summary.text}>
      {summary.ratio === null ? null : (
        <div
          className="hist-bar"
          role="progressbar"
          aria-label="Sťahovanie histórie"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(summary.ratio * 100)}
        >
          <i style={{ width: `${String(summary.ratio * 100)}%` }} />
        </div>
      )}
    </SettingRow>
  );
}
