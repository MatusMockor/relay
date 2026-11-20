import type { AutomationHistoryStats } from '@relay/shared';
import { messageTimeLabel } from '../../../../lib/dates';

export function HistoryStats({ stats }: { readonly stats: AutomationHistoryStats }) {
  return (
    <dl className="au-hist-stats" aria-label="Štatistiky pravidla">
      <div>
        <dt>Spustenia za {String(stats.days)} dní</dt>
        <dd>{String(stats.runs)}</dd>
      </div>
      <div>
        <dt>Posledné spustenie</dt>
        <dd>
          {stats.lastRunAt === null ? (
            'Ešte nikdy'
          ) : (
            <time dateTime={stats.lastRunAt}>{messageTimeLabel(stats.lastRunAt, new Date())}</time>
          )}
        </dd>
      </div>
      <div className={stats.failedActions > 0 ? 'bad' : undefined}>
        <dt>Zlyhané akcie</dt>
        <dd>{String(stats.failedActions)}</dd>
      </div>
    </dl>
  );
}
