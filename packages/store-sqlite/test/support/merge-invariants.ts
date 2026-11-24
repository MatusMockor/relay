import { MESSAGE_PENDING_KINDS } from '@relay/engine';
import { expect } from 'vitest';
import {
  MESSAGE_COLUMN_REFERENCES,
  MESSAGE_JSON_REFERENCES,
} from '../../src/repositories/merges/message-references';
import type { TestStore } from './test-database';

interface IdRow {
  readonly id: string;
}

interface JsonRow {
  readonly value: string | null;
}

const ids = (store: TestStore, statement: string): string[] =>
  store.database.sqlite
    .prepare<[], IdRow>(statement)
    .all()
    .map((row) => row.id);

const valuesAt = (value: unknown, segments: readonly string[]): unknown[] => {
  const [segment, ...rest] = segments;
  if (segment === undefined) {
    return [value];
  }
  if (segment === '[*]') {
    return Array.isArray(value) ? value.flatMap((item: unknown) => valuesAt(item, rest)) : [];
  }
  if (typeof value !== 'object' || value === null || !(segment in value)) {
    return [];
  }
  return valuesAt((value as Record<string, unknown>)[segment], rest);
};

const pathSegments = (path: string): string[] =>
  path
    .slice(1)
    .split(/(\[\*\])|\./)
    .filter(
      (segment: string | undefined): segment is string => segment !== undefined && segment !== '',
    );

export const referencedJsonIds = (store: TestStore): string[] =>
  MESSAGE_JSON_REFERENCES.flatMap(({ table, column, paths }) =>
    store.database.sqlite
      .prepare<[], JsonRow>(`select ${column} as value from ${table}`)
      .all()
      .flatMap((row) => {
        const parsed: unknown = row.value === null ? null : JSON.parse(row.value);
        return paths.flatMap((path) => valuesAt(parsed, pathSegments(path)));
      })
      .filter((id): id is string => typeof id === 'string'),
  );

export const referencedPendingIds = (store: TestStore): string[] => {
  const kinds = MESSAGE_PENDING_KINDS.map((kind) => `'${kind}'`).join(', ');
  return ids(
    store,
    `select json_extract(payload, '$.messageId') as id from pending_work
     where kind in (${kinds}) and json_extract(payload, '$.messageId') is not null
     union all select ref as id from pending_work where kind = 'jira-event'`,
  );
};

export const referencedColumnIds = (store: TestStore): string[] =>
  MESSAGE_COLUMN_REFERENCES.filter(({ column }) => column !== 'alias_id').flatMap(
    ({ table, column }) =>
      ids(store, `select ${column} as id from ${table} where ${column} is not null`),
  );

const resolvable = (store: TestStore): Set<string> =>
  new Set([
    ...ids(store, 'select id from messages'),
    ...ids(store, 'select alias_id as id from message_aliases'),
  ]);

export const expectMergeInvariants = (store: TestStore): void => {
  expect(
    ids(
      store,
      'select id from messages m where not exists (select 1 from message_placements p where p.message_id = m.id)',
    ),
  ).toEqual([]);
  expect(
    ids(
      store,
      'select id from messages m where not exists (select 1 from message_placements p where p.message_id = m.id and p.mailbox_id = m.mailbox_id and p.uid = m.uid)',
    ),
  ).toEqual([]);
  expect(
    ids(
      store,
      'select alias_id as id from message_aliases a where not exists (select 1 from messages m where m.id = a.message_id)',
    ),
  ).toEqual([]);
  const known = resolvable(store);
  const referenced = [
    ...referencedColumnIds(store),
    ...referencedJsonIds(store),
    ...referencedPendingIds(store),
  ];
  expect(referenced.filter((id) => !known.has(id))).toEqual([]);
};

export const expectNoLoserReferences = (
  store: TestStore,
  losers: readonly string[],
  allowed: readonly string[] = [],
): void => {
  const lost = new Set(losers);
  const referenced = [
    ...referencedColumnIds(store),
    ...referencedJsonIds(store),
    ...referencedPendingIds(store),
  ];
  expect(referenced.filter((id) => lost.has(id) && !allowed.includes(id))).toEqual([]);
};
