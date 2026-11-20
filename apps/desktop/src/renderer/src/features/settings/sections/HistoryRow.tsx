import { useHistoryProgress } from '../../../data/hooks/use-history-progress';
import { SettingRow } from '../SettingRow';
import { summarizeHistory } from './history-summary';

export function HistoryRow() {
  const progress = useHistoryProgress();
  const summary = summarizeHistory(progress.data ?? []);
  if (summary === null) {
    return null;
  }
  return (
    <SettingRow title="Staršia pošta" description={summary.text}>
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
