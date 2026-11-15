import type { ParsedMessage } from '@relay/engine';
import { JiraKeySchema, type JiraKey } from '@relay/shared/domain';

const PARENTHESIZED_KEY = /\(([A-Z][A-Z0-9_]+-\d+)\)/;
const BARE_KEY = /(?<![A-Za-z0-9_-])([A-Z][A-Z0-9_]+-\d+)(?![A-Za-z0-9_-])/;
const BROWSE_KEY = /\/browse\/([A-Z][A-Z0-9_]+-\d+)/;

const firstGroup = (pattern: RegExp, value: string | null): string | null =>
  value === null ? null : (pattern.exec(value)?.[1] ?? null);

export const extractJiraKey = (message: ParsedMessage): JiraKey | null => {
  const candidates = [
    firstGroup(PARENTHESIZED_KEY, message.subject),
    firstGroup(BARE_KEY, message.subject),
    firstGroup(BROWSE_KEY, message.textBody),
    firstGroup(BROWSE_KEY, message.htmlBody),
  ];
  for (const candidate of candidates) {
    const parsed = JiraKeySchema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
};
