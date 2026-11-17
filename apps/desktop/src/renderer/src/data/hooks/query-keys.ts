import type { ThreadId } from '@relay/shared';
import type { TaskListParams, ThreadListParams } from '../MailClient';

export const queryKeys = {
  all: ['mail'] as const,
  threadLists: () => ['mail', 'threads', 'list'] as const,
  threadList: (params: ThreadListParams) => ['mail', 'threads', 'list', params] as const,
  threadScan: (params: ThreadListParams) =>
    ['mail', 'threads', 'list', { ...params, scan: true }] as const,
  threadDetails: () => ['mail', 'threads', 'detail'] as const,
  thread: (id: ThreadId) => ['mail', 'threads', 'detail', id] as const,
  threadAiAll: () => ['mail', 'threads', 'ai'] as const,
  threadAiOf: (id: ThreadId) => ['mail', 'threads', 'ai', id] as const,
  threadAi: (id: ThreadId, lastMessageAt: string) =>
    ['mail', 'threads', 'ai', id, lastMessageAt] as const,
  unsubscribe: (id: ThreadId) => ['mail', 'senders', 'unsubscribe', id] as const,
  accounts: () => ['mail', 'accounts'] as const,
  labels: () => ['mail', 'labels'] as const,
  splits: () => ['mail', 'splits'] as const,
  automations: () => ['mail', 'automations'] as const,
  tasks: (params: TaskListParams) => ['mail', 'tasks', params] as const,
  taskLists: () => ['mail', 'tasks'] as const,
  drafts: () => ['mail', 'drafts'] as const,
  scheduled: () => ['mail', 'scheduled'] as const,
  settings: () => ['mail', 'settings'] as const,
  runners: () => ['mail', 'runners'] as const,
  localRunners: () => ['mail', 'runners', 'local'] as const,
  devices: () => ['mail', 'devices'] as const,
};
