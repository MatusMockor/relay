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
import { settled } from './settled';

type DemoAutomationHistoryMethods = Pick<
  Organizer,
  'automationHistory' | 'undoAutomationActivity' | 'undoAutomationSince'
>;

const DAY_MS = 86_400_000;

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
    const actions = undo.undo(entry);
    const outcomes = actions.map((action) => action.undo);
    const done =
      outcomes.every((outcome) => outcome !== 'failed') &&
      outcomes.some((outcome) => outcome !== 'notUndoable');
    const saved = { ...entry, actions, undoneAt: done ? now().toISOString() : null };
    state.ruleHistory = state.ruleHistory.map((item) => (item.id === entry.id ? saved : item));
    return {
      entry: saved,
      alreadyUndone: false,
      results: actions.map((action) => ({
        action: action.action,
        outcome: action.undo ?? 'skipped',
      })),
    };
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
