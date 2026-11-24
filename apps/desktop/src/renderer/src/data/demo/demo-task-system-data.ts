import {
  type ExternalTask,
  type TaskSystemConnection,
  type TaskSystemProvider,
  type TaskSystemConnectionId,
  TaskSystemConnectionIdSchema,
} from '@relay/shared';
import { MailClientError } from '../errors';
import { demoIds } from './seed/ids';
import type { DemoTicketSeed } from './seed/task-system-tickets';

export const DEMO_JIRA_SITE = 'https://acme.atlassian.net';
export const DEMO_JIRA_EMAIL = 'jan.novak@acme.sk';
export const DEMO_JIRA_ACCOUNT = 'Ján Novák';

export interface DemoConnectionRecord {
  readonly connection: TaskSystemConnection;
  readonly account: string;
  readonly tickets: readonly DemoTicketSeed[];
}

const HOUR_MS = 3_600_000;

const pad = (value: number): string => String(value).padStart(2, '0');

const localDate = (now: Date, days: number): string => {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const demoConnectionId = (index: number): TaskSystemConnectionId =>
  TaskSystemConnectionIdSchema.parse(`tsc-demo-${String(index)}`);

export const demoConnection = (
  id: TaskSystemConnectionId,
  fields: Pick<TaskSystemConnection, 'provider' | 'label' | 'siteUrl' | 'accountName'>,
  at: string,
): TaskSystemConnection => ({
  id,
  userId: demoIds.user,
  ...fields,
  status: 'ok',
  lastError: null,
  createdAt: at,
  updatedAt: at,
});

const GITHUB_KEY = /^(.+)#(\d+)$/;

const TICKET_URLS: Readonly<Record<TaskSystemProvider, (siteUrl: string, key: string) => string>> =
  {
    jira: (siteUrl, key) => `${siteUrl}/browse/${key}`,
    linear: (siteUrl, key) => `${siteUrl}/issue/${key.toLowerCase()}`,
    github: (siteUrl, key) => {
      const match = GITHUB_KEY.exec(key);
      return match === null ? siteUrl : `${siteUrl}/${match[1] ?? ''}/issues/${match[2] ?? ''}`;
    },
  };

export const demoTicket = (
  record: DemoConnectionRecord,
  seed: DemoTicketSeed,
  now: Date,
): ExternalTask => ({
  connectionId: record.connection.id,
  provider: record.connection.provider,
  externalId: `${record.connection.id}-${seed.key}`,
  key: seed.key,
  title: seed.title,
  url: TICKET_URLS[record.connection.provider](record.connection.siteUrl, seed.key),
  status: seed.status,
  priority: seed.priority,
  projectName: seed.projectName,
  dueDate: seed.dueInDays === null ? null : localDate(now, seed.dueInDays),
  updatedAt: new Date(now.getTime() - seed.updatedHoursAgo * HOUR_MS).toISOString(),
});

const invalidSite = () =>
  new MailClientError({
    code: 'validation_failed',
    message:
      'Adresa webu Jira musí byť platná https adresa, napríklad https://firma.atlassian.net.',
  });

const parsedUrl = (raw: string): URL | null => {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
};

export const demoSiteUrl = (raw: string): string => {
  const url = parsedUrl(raw);
  if (url?.protocol !== 'https:') {
    throw invalidSite();
  }
  return url.origin;
};

const REJECTED_MESSAGES: Readonly<Record<TaskSystemProvider, string>> = {
  jira: 'Jira odmietla prihlasovacie údaje. Skontroluj e-mail a API token.',
  linear: 'Linear odmietol API kľúč. Skontroluj, či je platný a nevypršal.',
  github: 'GitHub odmietol token. Skontroluj, či je platný a nevypršal.',
};

export const rejectedToken = (provider: TaskSystemProvider) =>
  new MailClientError({ code: 'forbidden', message: REJECTED_MESSAGES[provider] });
