import type { RemoteTextSearch, RemoteTextSearchField } from '@relay/engine';

const PREFIX: Record<RemoteTextSearchField, string> = {
  all: '',
  from: 'from:',
  subject: 'subject:',
};

const quoted = (term: string): string => `"${term.replace(/(["\\])/g, '\\$1')}"`;

const pad = (value: number): string => String(value).padStart(2, '0');

export const gmailDate = (date: Date): string =>
  `${String(date.getUTCFullYear())}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}`;

export const gmailRawQuery = (query: RemoteTextSearch): string => {
  const terms = query.terms.map((term) => `${PREFIX[query.field]}${quoted(term)}`);
  const before = query.before === undefined ? [] : [`before:${gmailDate(query.before)}`];
  return [...terms, ...before].join(' ');
};
