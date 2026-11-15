import type { ParsedMessage } from '@relay/engine';

export interface JiraSenderConfig {
  readonly senderAddresses?: readonly string[];
  readonly senderDomains?: readonly string[];
}

const CLOUD_SENDER = /^jira@[a-z0-9-]+(\.[a-z0-9-]+)*\.atlassian\.net$/;
const JIRA_MESSAGE_ID = /^<jira\./i;
const JIRA_SUBJECT_TAG = /^\s*\[jira\]/i;
const JIRA_SENDER_NAME = /\(jira\)\s*$/i;

const hasJiraHeader = (message: ParsedMessage): boolean =>
  [...message.headers.keys()].some((name) => name.startsWith('x-jira-'));

const isConfiguredSender = (email: string, config: JiraSenderConfig): boolean => {
  const domain = email.split('@')[1] ?? '';
  const addresses = (config.senderAddresses ?? []).map((address) => address.toLowerCase());
  const domains = (config.senderDomains ?? []).map((value) =>
    value.toLowerCase().replace(/^@/, ''),
  );
  return addresses.includes(email) || domains.includes(domain);
};

const isJiraSender = (message: ParsedMessage, config: JiraSenderConfig): boolean => {
  const from = message.from;
  if (!from) {
    return false;
  }
  const email = from.email.toLowerCase();
  if (CLOUD_SENDER.test(email) || isConfiguredSender(email, config)) {
    return true;
  }
  return email.startsWith('jira@') || JIRA_SENDER_NAME.test(from.name ?? '');
};

export const isJiraNotification = (message: ParsedMessage, config: JiraSenderConfig): boolean =>
  hasJiraHeader(message) ||
  isJiraSender(message, config) ||
  JIRA_MESSAGE_ID.test(message.messageIdHeader ?? '') ||
  JIRA_SUBJECT_TAG.test(message.subject);
