import {
  type ApplyAutomationResponse,
  type AutomationAction,
  type AutomationId,
  type ThreadAction,
  type ThreadSummary,
} from '@relay/shared';
import { MailClientError } from '../errors';
import { demoRuleMatches } from './demo-automation-match';
import { trackDemoAction } from './demo-action-effects';
import { applyActivityOf } from './demo-apply-activity';
import type { DemoMoves } from './demo-moves';
import type { DemoState } from './demo-state';

const LIMIT = 500;
const DAY_MS = 24 * 60 * 60_000;

const threadActionOf = (action: AutomationAction, at: Date): ThreadAction | null => {
  if (action.type === 'remind') {
    return { type: 'remind', at: new Date(at.getTime() + action.afterDays * DAY_MS).toISOString() };
  }
  if (action.type === 'markRead') {
    return { type: 'markRead' };
  }
  if (action.type === 'addLabel') {
    return { type: 'addLabel', labelId: action.labelId };
  }
  if (action.type === 'moveTo') {
    return { type: 'move', mailboxId: action.mailboxId };
  }
  if (action.type === 'archive') {
    return { type: 'archive' };
  }
  return null;
};

const ORDER: readonly ThreadAction['type'][] = [
  'markRead',
  'addLabel',
  'remind',
  'move',
  'archive',
];

interface PlannedAction {
  readonly action: AutomationAction;
  readonly threadAction: ThreadAction;
}

const rank = ({ threadAction }: PlannedAction): number => ORDER.indexOf(threadAction.type);

const planOf = (actions: readonly AutomationAction[], at: Date): PlannedAction[] =>
  actions
    .flatMap((action) => {
      const threadAction = threadActionOf(action, at);
      return threadAction === null ? [] : [{ action, threadAction }];
    })
    .sort((left, right) => rank(left) - rank(right));

export const createDemoAutomationApply = (
  state: DemoState,
  moves: DemoMoves,
  upserted: (thread: ThreadSummary) => void,
  now: () => Date,
) => {
  const applied = new Set<string>();
  return (automationId: AutomationId): ApplyAutomationResponse => {
    const automation = state.automations.find((item) => item.id === automationId);
    if (automation === undefined) {
      throw new MailClientError({ code: 'not_found', message: 'Pravidlo neexistuje' });
    }
    const at = now();
    const actions = planOf(automation.actions, at);
    if (actions.length === 0) {
      throw new MailClientError({
        code: 'validation_failed',
        message: 'Pravidlo nemá žiadnu akciu, ktorú by šlo použiť na existujúce maily',
      });
    }
    const matches = [...state.threads.values()].filter(
      (record) =>
        record.summary.state === 'inbox' &&
        (automation.accountId === null || record.summary.accountId === automation.accountId) &&
        demoRuleMatches(automation, record),
    );
    let count = 0;
    matches.slice(0, LIMIT).forEach((record) => {
      const key = `${automation.id}:${record.summary.id}`;
      if (applied.has(key)) {
        return;
      }
      applied.add(key);
      const recorded = actions.map(({ action, threadAction }) => {
        const tracked = trackDemoAction(record, moves, action, threadAction);
        upserted(tracked.thread);
        return tracked.recorded;
      });
      const activity = applyActivityOf(
        automation.id,
        record,
        recorded,
        at,
        state.ruleHistory.length,
      );
      moves.claimOrigin(activity.id, record.summary.id);
      state.ruleHistory = [...state.ruleHistory, activity];
      count += 1;
    });
    return { matched: Math.min(matches.length, LIMIT), applied: count, failed: 0 };
  };
};
