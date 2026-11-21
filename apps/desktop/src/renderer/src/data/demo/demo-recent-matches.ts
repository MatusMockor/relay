import {
  type AccountId,
  AUTOMATION_PREVIEW_DAYS,
  AUTOMATION_PREVIEW_SAMPLES,
  type AutomationCriteria,
  type AutomationPreviewResponse,
  type Message,
} from '@relay/shared';
import { demoMessageMatches } from './demo-automation-match';
import type { DemoState, DemoThreadRecord } from './demo-state';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEMO_PREVIEW_LIMIT = 500;
const DEMO_MESSAGES_PER_THREAD = 50;

export interface DemoRecentMatch {
  readonly record: DemoThreadRecord;
  readonly recent: readonly Message[];
  readonly message: Message;
}

export const demoRecentMatches = (
  state: DemoState,
  now: () => Date,
  accountId: AccountId | null,
  criteria: AutomationCriteria,
): DemoRecentMatch[] => {
  const since = now().getTime() - AUTOMATION_PREVIEW_DAYS * DAY_MS;
  const own = new Set(state.accounts.map((account) => account.email.toLowerCase()));
  const received = (message: Message): boolean =>
    Date.parse(message.date) >= since && !own.has(message.from?.email.toLowerCase() ?? '');
  return [...state.threads.values()]
    .filter(
      (record) =>
        record.summary.state !== 'trash' &&
        record.summary.state !== 'spam' &&
        (accountId === null || record.summary.accountId === accountId),
    )
    .flatMap((record): DemoRecentMatch[] => {
      const recent = [...record.messages]
        .sort((left, right) => left.date.localeCompare(right.date))
        .slice(-DEMO_MESSAGES_PER_THREAD)
        .filter(received);
      const message = recent
        .filter((item) => demoMessageMatches(criteria, item, record.summary.jiraKey))
        .at(-1);
      return message === undefined ? [] : [{ record, recent, message }];
    })
    .sort((left, right) => right.message.date.localeCompare(left.message.date));
};

export const demoPreviewResponse = (
  matches: readonly DemoRecentMatch[],
): AutomationPreviewResponse => {
  const kept = matches.slice(0, DEMO_PREVIEW_LIMIT);
  return {
    days: AUTOMATION_PREVIEW_DAYS,
    count: kept.length,
    truncated: matches.length > DEMO_PREVIEW_LIMIT,
    samples: kept.slice(0, AUTOMATION_PREVIEW_SAMPLES).map(({ record, message }) => ({
      accountId: record.summary.accountId,
      threadId: record.summary.id,
      from: message.from,
      subject: message.subject,
      date: message.date,
    })),
  };
};
