import {
  type ApplyAutomationResponse,
  type AutomationAction,
  type AutomationId,
  type ThreadAction,
  type ThreadSummary,
} from '@relay/shared';
import { MailClientError } from '../errors';
import { demoRuleMatches } from './demo-automation-match';
import type { DemoMoves } from './demo-moves';
import type { DemoState } from './demo-state';

const LIMIT = 500;

const threadActionOf = (action: AutomationAction): ThreadAction | null => {
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
    return { type: 'done' };
  }
  return null;
};

const ORDER: readonly ThreadAction['type'][] = ['markRead', 'addLabel', 'move', 'done'];

const rank = (action: ThreadAction): number => ORDER.indexOf(action.type);

export const createDemoAutomationApply = (
  state: DemoState,
  moves: DemoMoves,
  upserted: (thread: ThreadSummary) => void,
) => {
  const applied = new Set<string>();
  return (automationId: AutomationId): ApplyAutomationResponse => {
    const automation = state.automations.find((item) => item.id === automationId);
    if (automation === undefined) {
      throw new MailClientError({ code: 'not_found', message: 'Pravidlo neexistuje' });
    }
    const actions = automation.actions
      .flatMap((action) => threadActionOf(action) ?? [])
      .sort((left, right) => rank(left) - rank(right));
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
        demoRuleMatches(automation.conditions, record),
    );
    let count = 0;
    matches.slice(0, LIMIT).forEach((record) => {
      const key = `${automation.id}:${record.summary.id}`;
      if (applied.has(key)) {
        return;
      }
      applied.add(key);
      actions.forEach((action) => {
        upserted(moves.apply(record, action));
      });
      count += 1;
    });
    return { matched: Math.min(matches.length, LIMIT), applied: count, failed: 0 };
  };
};
