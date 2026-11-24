import type { ThreadFolderQuery } from '@relay/engine';
import { expect } from 'vitest';
import { LOCAL_USER_ID } from '../../src';
import { timeIdCursor } from '../../src/pagination/time-id-cursor';
import { selectFolderThreads } from '../../src/repositories/threads/thread-folder-select';
import { BULK_LABEL_ID, BULK_SEARCH_TERM } from './bulk-thread-seed';
import type { FolderScale } from './folder-scale-fixture';
import { folderQuery } from './folder-scenario';

export const SCALE_PAGE_LIMIT = 200;

const PRIMARY_KEY_STEP = /^SEARCH threads USING INDEX sqlite_autoindex_threads_1 \(id=\?\)/;
const MAILBOX_STEP =
  /^SEARCH message_placements .*INDEX message_placements_mailbox_uid_idx \(mailbox_id=\?/;

export interface Scenario {
  readonly name: string;
  readonly query: () => Partial<ThreadFolderQuery>;
  readonly mailboxFirst?: boolean;
}

export const folderScaleScenarios = (scale: () => FolderScale): readonly Scenario[] => [
  { name: 'inbox', query: () => ({ view: 'inbox' }) },
  {
    name: 'inbox of one account',
    query: () => ({ view: 'inbox', accountId: scale().mailboxes.inbox.accountId }),
  },
  { name: 'done', query: () => ({ view: 'done' }) },
  { name: 'sent', query: () => ({ view: 'sent' }) },
  { name: 'everywhere', query: () => ({ everywhere: true }) },
  { name: 'everywhere unread', query: () => ({ everywhere: true, unread: true }) },
  {
    name: 'archive mailbox',
    query: () => ({ view: 'mailbox', mailboxId: scale().mailboxes.archive.id }),
  },
  {
    name: 'custom folder',
    query: () => ({ view: 'mailbox', mailboxId: scale().mailboxes.folder.id }),
  },
  {
    name: 'tiny folder',
    query: () => ({ view: 'mailbox', mailboxId: scale().mailboxes.tiny.id }),
    mailboxFirst: true,
  },
  {
    name: 'single thread folder',
    query: () => ({ view: 'mailbox', mailboxId: scale().mailboxes.single.id }),
    mailboxFirst: true,
  },
  {
    name: 'label',
    query: () => ({ view: 'label', labelId: BULK_LABEL_ID as ThreadFolderQuery['labelId'] }),
  },
  { name: 'search', query: () => ({ view: 'done', search: BULK_SEARCH_TERM }) },
];

export const scenarioQuery = (scenario: Scenario, cursor: string | null): ThreadFolderQuery =>
  folderQuery({ limit: SCALE_PAGE_LIMIT, ...scenario.query(), cursor });

export const deepCursorOf = (scale: FolderScale): string => timeIdCursor.encode(scale.deepPosition);

export const planOf = (scale: FolderScale, query: ThreadFolderQuery): string[] => {
  const statement = selectFolderThreads(
    scale.store.database.db,
    LOCAL_USER_ID,
    query,
    timeIdCursor.decode(query.cursor),
    query.limit + 1,
  ).toSQL();
  const rows: unknown[] = scale.store.database.sqlite
    .prepare(`explain query plan ${statement.sql}`)
    .all(...statement.params);
  return rows.map((row) => String((row as { detail: unknown }).detail));
};

export const threadStepOf = (plan: readonly string[]): string =>
  plan.find((detail) => /\bthreads\b/.test(detail)) ?? '';

export const usesTempBTree = (plan: readonly string[]): boolean =>
  plan.some((detail) => detail.includes('TEMP B-TREE'));

export const expectMailboxFirst = (plan: readonly string[]): void => {
  expect(threadStepOf(plan)).toMatch(PRIMARY_KEY_STEP);
  expect(plan.some((detail) => MAILBOX_STEP.test(detail))).toBe(true);
  expect(plan.some((detail) => detail.includes('threads_user_order_idx'))).toBe(false);
};
