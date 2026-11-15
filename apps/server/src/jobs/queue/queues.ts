import type { QueueDefinition } from './job-queue';

export const QUEUES = {
  syncAccount: { name: 'sync-account', policy: 'stately', retryLimit: 0, expireInSeconds: 900 },
  dueReminders: { name: 'due-reminders', policy: 'stately', retryLimit: 0, expireInSeconds: 120 },
  dueScheduledSends: {
    name: 'due-scheduled-sends',
    policy: 'stately',
    retryLimit: 0,
    expireInSeconds: 300,
  },
  aiJob: { name: 'ai-job', policy: 'standard', retryLimit: 0, expireInSeconds: 900 },
  dueAiJobs: { name: 'due-ai-jobs', policy: 'stately', retryLimit: 0, expireInSeconds: 1800 },
} as const satisfies Record<string, QueueDefinition>;
