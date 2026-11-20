import type { RemoteTextSearch, RemoteTextSearchField } from '@relay/engine';

export type SearchAttribute =
  | { readonly type: 'ATOM'; readonly value: string }
  | { readonly type: 'STRING'; readonly value: string }
  | { readonly type: 'LITERAL'; readonly value: Buffer };

const KEY: Record<RemoteTextSearchField, string> = {
  all: 'TEXT',
  from: 'FROM',
  subject: 'SUBJECT',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const NON_ASCII = /[^\x20-\x7e]/;

export const isAscii = (value: string): boolean => !NON_ASCII.test(value);

export const imapDate = (date: Date): string =>
  `${String(date.getUTCDate()).padStart(2, '0')}-${MONTHS[date.getUTCMonth()] ?? 'Jan'}-${String(date.getUTCFullYear())}`;

const atom = (value: string): SearchAttribute => ({ type: 'ATOM', value });

const termValue = (term: string): SearchAttribute =>
  isAscii(term)
    ? { type: 'STRING', value: term }
    : { type: 'LITERAL', value: Buffer.from(term, 'utf8') };

export const imapSearchAttributes = (query: RemoteTextSearch): SearchAttribute[] => {
  const charset = query.terms.every(isAscii) ? [] : [atom('CHARSET'), atom('UTF-8')];
  const terms = query.terms.flatMap((term) => [atom(KEY[query.field]), termValue(term)]);
  const before = query.before === undefined ? [] : [atom('BEFORE'), atom(imapDate(query.before))];
  return [...charset, ...terms, ...before];
};
