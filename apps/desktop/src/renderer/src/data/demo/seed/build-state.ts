import { DEFAULT_USER_SETTINGS, type MailAccount, type Split, type Task } from '@relay/shared';
import { buildDemoAutomations } from './automations';
import { buildDemoRuleHistory } from './rule-history';
import type { DemoState, DemoThreadRecord } from '../demo-state';
import { buildArchive } from './build-archive';
import { buildDrafts } from './build-drafts';
import { buildThreadRecord } from './build-threads';
import { DEMO_ACCOUNTS, DEMO_LABELS } from './catalog';
import { buildDemoMailboxes } from './folders';
import { atTime } from './clock';
import { demoIds } from './ids';
import { PERSONAL_THREADS } from './threads-personal';
import { FOLDER_THREADS } from './threads-folders';
import { SPAM_THREADS } from './threads-spam';
import { WORK_THREADS } from './threads-work';
import { WORK_THREADS_MORE } from './threads-work-more';
import type { DemoThread } from './types';

const buildAccounts = (now: Date): MailAccount[] =>
  DEMO_ACCOUNTS.map((seed) => ({
    id: demoIds.account(seed.key),
    userId: demoIds.user,
    provider: seed.provider,
    displayName: seed.name,
    senderName: 'Ján Adamec',
    email: seed.email,
    color: seed.color,
    isPrimary: seed.isPrimary,
    syncIntervalSeconds: seed.interval,
    settings: {
      imap: { host: seed.imap, port: 993, secure: true },
      smtp: { host: seed.smtp, port: 587, secure: false },
      username: seed.email,
    },
    status: 'connected',
    lastError: null,
    lastSyncedAt: atTime(now, [0, now.getHours(), Math.max(0, now.getMinutes() - 2)]),
    createdAt: atTime(now, [-60, 9, 0]),
  }));

const buildSplits = (): Split[] => [
  {
    id: demoIds.split('jira'),
    userId: demoIds.user,
    accountId: demoIds.account('efa'),
    name: 'Jira',
    order: 0,
    match: 'any',
    exceptions: [],
    exclusive: true,
    hideTasks: false,
    rules: [{ type: 'jira', projectKeys: ['WEB', 'API', 'CMS'] }],
  },
  {
    id: demoIds.split('clients'),
    userId: demoIds.user,
    accountId: demoIds.account('fl'),
    name: 'Klienti',
    order: 1,
    match: 'any',
    exceptions: [],
    exclusive: true,
    hideTasks: false,
    rules: [
      { type: 'fromDomain', domain: 'kaviaren-zrnko.sk' },
      { type: 'fromDomain', domain: 'atelier-brezina.sk' },
    ],
  },
  {
    id: demoIds.split('other'),
    userId: demoIds.user,
    accountId: null,
    name: 'Ostatné',
    order: 2,
    match: 'any',
    exceptions: [],
    exclusive: true,
    hideTasks: false,
    rules: [
      { type: 'header', name: 'List-Unsubscribe', pattern: '.+' },
      { type: 'fromDomain', domain: 'firma.sk' },
    ],
  },
];

const buildTasks = (seeds: readonly DemoThread[], now: Date): Task[] =>
  seeds.flatMap((seed) =>
    seed.task === undefined
      ? []
      : [
          {
            id: demoIds.task(seed.id),
            userId: demoIds.user,
            threadId: demoIds.thread(seed.id),
            jiraKey: seed.key ?? null,
            title: seed.task.title,
            aiWhat: seed.task.what,
            state: seed.task.state,
            source: seed.task.source ?? ('jira' as const),
            priority: seed.task.priority,
            createdAt: atTime(now, [-3, 9, 0]),
            updatedAt: atTime(now, [0, 7, 0]),
          },
        ],
  );

export const buildDemoState = (now: Date = new Date()): DemoState => {
  const seeds = [
    ...WORK_THREADS,
    ...WORK_THREADS_MORE,
    ...PERSONAL_THREADS,
    ...SPAM_THREADS,
    ...FOLDER_THREADS,
  ];
  const threads = new Map<string, DemoThreadRecord>(
    seeds.map((seed, order) => [seed.id, buildThreadRecord(seed, now, order)]),
  );
  const { drafts, scheduled } = buildDrafts(now);
  drafts.forEach((draft) => {
    const record =
      draft.inReplyToThreadId === null ? undefined : threads.get(draft.inReplyToThreadId);
    if (record !== undefined) {
      record.summary = { ...record.summary, hasDraft: true };
    }
  });
  return {
    accounts: buildAccounts(now),
    splits: buildSplits(),
    automations: buildDemoAutomations(),
    ruleHistory: buildDemoRuleHistory(threads, now),
    labels: DEMO_LABELS.map((label) => ({
      id: demoIds.label(label.key),
      accountId: demoIds.account(label.acct),
      name: label.name,
      color: label.color,
      kind: label.acct === 'os' ? 'gmail' : 'keyword',
      remoteName: label.name,
    })),
    mailboxes: buildDemoMailboxes(),
    threads,
    archive: buildArchive(now),
    tasks: buildTasks(seeds, now),
    drafts,
    scheduled,
    settings: { ...DEFAULT_USER_SETTINGS, notifications: 'off' },
  };
};
