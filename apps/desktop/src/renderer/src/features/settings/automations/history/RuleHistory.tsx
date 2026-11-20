import { type AutomationActivity, type AutomationId, isUndoableActivity } from '@relay/shared';
import { Button } from '@relay/ui';
import { describeError } from '../../../../data/errors';
import { useAutomationHistory } from '../../../../data/hooks/use-automation-history';
import {
  useUndoAutomationActivity,
  useUndoAutomationSince,
} from '../../../../data/hooks/use-undo-automation';
import { showToast } from '../../../../state/toast-store';
import type { ActionTargets } from '../action-targets';
import { HistoryEntryRow } from './HistoryEntryRow';
import { HistoryStats } from './HistoryStats';
import { startOfToday, undoEntryMessage, undoSinceMessage } from './undo-messages';
import { useLocalDay } from './use-local-day';

export interface RuleHistoryProps {
  readonly automationId: AutomationId | null;
  readonly targets: ActionTargets;
}

const failed = (error: unknown) => {
  showToast(describeError(error));
};

function SavedRuleHistory({
  automationId,
  targets,
}: {
  readonly automationId: AutomationId;
  readonly targets: ActionTargets;
}) {
  const history = useAutomationHistory(automationId);
  const undoEntry = useUndoAutomationActivity(automationId);
  const undoToday = useUndoAutomationSince(automationId);
  const day = useLocalDay();
  const busy = undoEntry.isPending || undoToday.isPending;
  if (history.isError) {
    return <p className="au-hint">{describeError(history.error)}</p>;
  }
  if (history.data === undefined) {
    return <p className="au-hist-note">Načítavam históriu…</p>;
  }
  const { stats, entries } = history.data;
  const today = entries.filter((entry) => entry.createdAt >= day && isUndoableActivity(entry));
  const undo = (entry: AutomationActivity) => {
    undoEntry.mutate(entry.id, {
      onSuccess: (result) => {
        showToast(undoEntryMessage(result));
      },
      onError: failed,
    });
  };
  return (
    <>
      <HistoryStats stats={stats} />
      <div className="au-hist-head">
        <h3>Posledné spustenia</h3>
        <Button
          disabled={busy || today.length === 0}
          onClick={() => {
            undoToday.mutate(startOfToday(new Date()), {
              onSuccess: (result) => {
                showToast(undoSinceMessage(result));
              },
              onError: failed,
            });
          }}
        >
          Vrátiť všetko z dneška
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="au-hist-note">Pravidlo sa zatiaľ nespustilo.</p>
      ) : (
        <ul className="au-hist-list" aria-label="Posledné spustenia">
          {entries.map((entry) => (
            <HistoryEntryRow
              key={entry.id}
              entry={entry}
              targets={targets}
              busy={busy}
              onUndo={undo}
            />
          ))}
        </ul>
      )}
    </>
  );
}

export function RuleHistory({ automationId, targets }: RuleHistoryProps) {
  return (
    <section className="au-sec au-hist" aria-label="História pravidla">
      {automationId === null ? (
        <p className="au-hist-note">História sa zobrazí, keď pravidlo uložíš.</p>
      ) : (
        <SavedRuleHistory automationId={automationId} targets={targets} />
      )}
    </section>
  );
}
