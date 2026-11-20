import {
  AUTOMATION_HISTORY_DAYS,
  AUTOMATION_HISTORY_LIMIT,
  type AutomationActivity,
  type AutomationActivityId,
  type AutomationHistoryResponse,
  type AutomationId,
  isUndoableActivity,
  type UndoAutomationActivityResponse,
  type UndoAutomationSinceResponse,
} from '@relay/shared';
import { MailClientError } from '../errors';
import type { Organizer } from '../MailClient';
import type { DemoRuleUndo } from './demo-rule-undo';
import type { DemoState } from './demo-state';

type DemoAutomationHistoryMethods = Pick<
  Organizer,
  'automationHistory' | 'undoAutomationActivity' | 'undoAutomationSince'
>;

const DAY_MS = 86_400_000;

const settled = <Result>(work: () => Result): Promise<Result> => {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
};

const notFound = (what: string) =>
  new MailClientError({ code: 'not_found', message: `${what} neexistuje` });

const newestFirst = (left: AutomationActivity, right: AutomationActivity): number =>
  right.createdAt.localeCompare(left.createdAt);

export const createDemoAutomationHistory = (
  state: DemoState,
  now: () => Date,
  undo: DemoRuleUndo,
): DemoAutomationHistoryMethods => {
  const entriesOf = (automationId: AutomationId): AutomationActivity[] => {
    if (!state.automations.some((automation) => automation.id === automationId)) {
      throw notFound('Pravidlo');
    }
    return state.ruleHistory
      .filter((entry) => entry.automationId === automationId)
      .sort(newestFirst);
  };
  const history = (automationId: AutomationId): AutomationHistoryResponse => {
    const entries = entriesOf(automationId);
    const since = new Date(now().getTime() - AUTOMATION_HISTORY_DAYS * DAY_MS).toISOString();
    const recent = entries.filter((entry) => entry.createdAt >= since);
    return {
      stats: {
        days: AUTOMATION_HISTORY_DAYS,
        runs: recent.length,
        failedActions: recent.flatMap((entry) =>
          entry.actions.filter((action) => action.outcome === 'failed'),
        ).length,
        lastRunAt: entries[0]?.createdAt ?? null,
      },
      entries: entries.slice(0, AUTOMATION_HISTORY_LIMIT),
    };
  };
  const undoEntry = (entry: AutomationActivity): UndoAutomationActivityResponse => {
    if (entry.undoneAt !== null) {
      return { entry, alreadyUndone: true, results: [] };
    }
    const results = undo.undo(entry);
    const settledEntry =
      isUndoableActivity(entry) && results.every((result) => result.outcome !== 'failed')
        ? { ...entry, undoneAt: now().toISOString() }
        : entry;
    state.ruleHistory = state.ruleHistory.map((item) =>
      item.id === entry.id ? settledEntry : item,
    );
    return { entry: settledEntry, alreadyUndone: false, results };
  };
  const undoActivity = (automationId: AutomationId, activityId: AutomationActivityId) => {
    const entry = entriesOf(automationId).find((item) => item.id === activityId);
    if (entry === undefined) {
      throw notFound('Záznam histórie');
    }
    return undoEntry(entry);
  };
  const undoSince = (automationId: AutomationId, since: string): UndoAutomationSinceResponse => {
    const from = new Date(since).toISOString();
    const outcomes = entriesOf(automationId)
      .filter((entry) => entry.createdAt >= from && isUndoableActivity(entry))
      .map((entry) => undoEntry(entry).entry.undoneAt !== null);
    return {
      entries: outcomes.length,
      undone: outcomes.filter(Boolean).length,
      failed: outcomes.filter((done) => !done).length,
    };
  };
  return {
    automationHistory: (automationId) => settled(() => history(automationId)),
    undoAutomationActivity: (automationId, activityId) =>
      settled(() => undoActivity(automationId, activityId)),
    undoAutomationSince: (automationId, since) => settled(() => undoSince(automationId, since)),
  };
};
