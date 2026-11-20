import {
  type AutomationActivity,
  type AutomationActivityAction,
  AutomationActivityIdSchema,
  type AutomationActivitySource,
  type AutomationId,
} from '@relay/shared';
import type { DemoThreadRecord } from '../demo-state';
import { automationId } from './automations';
import { atTime } from './clock';
import { demoIds } from './ids';

const MINUTE_MS = 60_000;

interface DemoRunSeed {
  readonly key: string;
  readonly automation: AutomationId;
  readonly thread: string;
  readonly source: AutomationActivitySource;
  readonly actions: readonly AutomationActivityAction[];
  readonly at?: (messageAt: number) => number;
  readonly undoneAfterMs?: number;
}

const startOfDay = (now: Date): number => {
  const copy = new Date(now);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
};

const efaLabel = { type: 'addLabel', labelId: demoIds.label('efa') } as const;
const projekty = { type: 'moveTo', mailboxId: demoIds.folder('efa', 'projekty') } as const;

const seeds = (now: Date): DemoRunSeed[] => [
  {
    key: 'merged',
    automation: automationId('gitlab'),
    thread: 'o-mr-merged',
    source: 'live',
    actions: [
      { action: { type: 'markRead' }, outcome: 'ok' },
      { action: { type: 'archive' }, outcome: 'ok' },
    ],
    at: (messageAt) => Math.max(startOfDay(now), Math.min(messageAt + MINUTE_MS, now.getTime())),
  },
  {
    key: 'pipeline',
    automation: automationId('gitlab'),
    thread: 'o-pipeline',
    source: 'live',
    actions: [
      { action: efaLabel, outcome: 'failed' },
      { action: projekty, outcome: 'failed' },
    ],
  },
  {
    key: 'pipeline-apply',
    automation: automationId('gitlab'),
    thread: 'o-pipeline',
    source: 'apply',
    actions: [
      { action: efaLabel, outcome: 'ok' },
      { action: projekty, outcome: 'ok' },
    ],
    at: () => Date.parse(atTime(now, [-3, 14, 5])),
    undoneAfterMs: 15 * MINUTE_MS,
  },
  {
    key: 'web482',
    automation: automationId('mentions'),
    thread: 'c-web482',
    source: 'live',
    actions: [
      { action: { type: 'summary' }, outcome: 'ok' },
      { action: { type: 'task' }, outcome: 'ok' },
    ],
  },
];

const activityOf = (
  seed: DemoRunSeed,
  record: DemoThreadRecord,
  now: Date,
): AutomationActivity | null => {
  const message = record.messages.at(-1);
  if (message === undefined) {
    return null;
  }
  const messageAt = Date.parse(message.date);
  const at = seed.at?.(messageAt) ?? Math.min(messageAt + MINUTE_MS, now.getTime());
  return {
    id: AutomationActivityIdSchema.parse(`activity-seed-${seed.key}`),
    automationId: seed.automation,
    accountId: record.summary.accountId,
    threadId: record.summary.id,
    messageId: message.id,
    source: seed.source,
    from: message.from,
    subject: message.subject,
    actions: [...seed.actions],
    createdAt: new Date(at).toISOString(),
    undoneAt:
      seed.undoneAfterMs === undefined ? null : new Date(at + seed.undoneAfterMs).toISOString(),
  };
};

export const buildDemoRuleHistory = (
  threads: ReadonlyMap<string, DemoThreadRecord>,
  now: Date,
): AutomationActivity[] =>
  seeds(now).flatMap((seed) => {
    const record = threads.get(seed.thread);
    const activity = record === undefined ? null : activityOf(seed, record, now);
    return activity === null ? [] : [activity];
  });
