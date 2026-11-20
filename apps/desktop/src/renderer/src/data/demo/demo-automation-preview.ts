import {
  AUTOMATION_PREVIEW_DAYS,
  AUTOMATION_PREVIEW_SAMPLES,
  type AutomationPreviewBody,
  AutomationPreviewBodySchema,
  type AutomationPreviewResponse,
  type Message,
} from '@relay/shared';
import { MailClientError } from '../errors';
import { demoMessageMatches } from './demo-automation-match';
import type { DemoState, DemoThreadRecord } from './demo-state';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEMO_PREVIEW_LIMIT = 500;

interface DemoPreviewMatch {
  readonly record: DemoThreadRecord;
  readonly message: Message;
}

export const createDemoAutomationPreview =
  (state: DemoState, now: () => Date) =>
  (body: AutomationPreviewBody): AutomationPreviewResponse => {
    const parsed = AutomationPreviewBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new MailClientError({ code: 'validation_failed', message: 'Pravidlo nie je platné' });
    }
    const criteria = parsed.data;
    const since = now().getTime() - AUTOMATION_PREVIEW_DAYS * DAY_MS;
    const own = new Set(state.accounts.map((account) => account.email.toLowerCase()));
    const received = (message: Message): boolean =>
      Date.parse(message.date) >= since && !own.has(message.from?.email.toLowerCase() ?? '');
    const matches = [...state.threads.values()]
      .filter(
        (record) =>
          record.summary.state !== 'trash' &&
          record.summary.state !== 'spam' &&
          (criteria.accountId === null || record.summary.accountId === criteria.accountId),
      )
      .flatMap((record): DemoPreviewMatch[] => {
        const message = record.messages
          .filter((item) => received(item) && demoMessageMatches(criteria, item))
          .at(-1);
        return message === undefined ? [] : [{ record, message }];
      })
      .sort((left, right) => right.message.date.localeCompare(left.message.date));
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
