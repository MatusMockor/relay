import type { ThreadSearchField } from '@relay/shared';
import { foldText } from '../../lib/text';
import type { DemoThreadRecord } from './demo-state';

export interface DemoSearchCriteria {
  readonly q?: string;
  readonly searchField?: ThreadSearchField;
  readonly hasAttachment?: boolean;
  readonly unread?: boolean;
}

const termsOf = (q: string | undefined): string[] =>
  foldText(q?.trim() ?? '')
    .split(/\s+/)
    .filter((term) => term !== '');

const sendersOf = (record: DemoThreadRecord): string =>
  record.messages
    .flatMap((message) => (message.from === null ? [] : [message.from]))
    .map((from) => `${from.name ?? ''} ${from.email}`)
    .join(' ');

const textOf = (record: DemoThreadRecord, field: ThreadSearchField | undefined): string => {
  const thread = record.summary;
  if (field === 'subject') {
    return thread.subject;
  }
  if (field === 'from') {
    return sendersOf(record);
  }
  return [
    thread.subject,
    thread.snippet,
    thread.aiOneLiner ?? '',
    thread.jiraKey ?? '',
    ...thread.participants.map((person) => `${person.name ?? ''} ${person.email}`),
  ].join(' ');
};

const hasFile = (record: DemoThreadRecord): boolean =>
  record.messages.some((message) => message.attachments.some((file) => !file.inline));

const matchesText = (record: DemoThreadRecord, criteria: DemoSearchCriteria): boolean => {
  const terms = termsOf(criteria.q);
  if (terms.length === 0) {
    return true;
  }
  const hay = foldText(textOf(record, criteria.searchField));
  return terms.every((term) => hay.includes(term));
};

export const isDemoSearching = (q: string | undefined): boolean => termsOf(q).length > 0;

export const matchesDemoSearch = (
  record: DemoThreadRecord,
  criteria: DemoSearchCriteria,
): boolean =>
  matchesText(record, criteria) &&
  (criteria.unread !== true || record.summary.unread) &&
  (criteria.hasAttachment !== true || hasFile(record));
