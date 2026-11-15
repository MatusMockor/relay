import type { JiraKey } from './primitives';

const REPLY_PREFIX = /^(re|fw|fwd|aw|wg|sv|vs|odp|tr|rv|antw)\s*:\s*/i;
const JIRA_TAG = /^\[jira\]\s*/i;
const MAX_ROUNDS = 10;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripLeading = (value: string, pattern: RegExp): string => {
  let current = value;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const next = current.replace(pattern, '').trimStart();
    if (next === current) {
      return current;
    }
    current = next;
  }
  return current;
};

export const stripJiraSubject = (subject: string, jiraKey: JiraKey): string => {
  const key = escapeRegExp(jiraKey);
  const keyToken = new RegExp(
    `^(?:\\p{L}[\\p{L} ]{0,40}:\\s*|updates for\\s+)?(?:\\(${key}\\)|\\[${key}\\]|${key}(?![\\p{L}\\d_-]))\\s*[:\\-]?\\s*`,
    'iu',
  );
  const untagged = stripLeading(stripLeading(subject.trim(), REPLY_PREFIX), JIRA_TAG);
  return untagged.replace(keyToken, '').trim();
};

export const displaySubject = (subject: string, jiraKey: JiraKey | null): string => {
  if (jiraKey === null) {
    return subject;
  }
  const stripped = stripJiraSubject(subject, jiraKey);
  return stripped === '' ? subject : stripped;
};
