import { type AutomationActivity, isUndoableActivity } from '@relay/shared';
import { Button, cx } from '@relay/ui';
import { messageTimeLabel } from '../../../../lib/dates';
import type { ActionTargets } from '../action-targets';
import { historyChipsOf } from './history-chips';

export interface HistoryEntryRowProps {
  readonly entry: AutomationActivity;
  readonly targets: ActionTargets;
  readonly busy: boolean;
  readonly onUndo: (entry: AutomationActivity) => void;
}

const senderOf = (entry: AutomationActivity): string =>
  entry.from?.name ?? entry.from?.email ?? 'Neznámy odosielateľ';

export function HistoryEntryRow({ entry, targets, busy, onUndo }: HistoryEntryRowProps) {
  const sender = senderOf(entry);
  const subject = entry.subject === '' ? '(bez predmetu)' : entry.subject;
  return (
    <li className="au-hist-row" aria-label={`Spustenie ${sender}: ${subject}`}>
      <time dateTime={entry.createdAt}>{messageTimeLabel(entry.createdAt, new Date())}</time>
      <div className="au-hist-main">
        <p className="au-hist-mail">
          <b>{sender}</b>
          <span>{subject}</span>
        </p>
        <ul className="au-hist-chips" aria-label="Vykonané akcie">
          {historyChipsOf(entry.actions, targets).map((chip) => (
            <li
              key={chip.key}
              className={cx(chip.failed && 'bad', !chip.reversible && 'fixed')}
              title={chip.reason ?? (chip.reversible ? undefined : 'Nedá sa vrátiť')}
            >
              {chip.failed ? `${chip.label} (zlyhalo)` : chip.label}
            </li>
          ))}
          {entry.source === 'apply' ? <li className="src">existujúce maily</li> : null}
        </ul>
      </div>
      {entry.undoneAt === null ? null : <span className="au-hist-undone">Vrátené</span>}
      {isUndoableActivity(entry) ? (
        <Button
          disabled={busy}
          aria-label={`Vrátiť spustenie ${subject}`}
          onClick={() => {
            onUndo(entry);
          }}
        >
          Vrátiť
        </Button>
      ) : null}
    </li>
  );
}
