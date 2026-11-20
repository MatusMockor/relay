import type { ThreadPage, ThreadSummary } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { appendPage } from '../src/data/hooks/thread-pages';
import { bulkThread } from './support/bulk-demo-threads';

const NEWEST = new Date(2026, 10, 19, 12, 0);

const threads = (from: number, to: number): ThreadSummary[] =>
  Array.from({ length: to - from }, (_, offset) => bulkThread(from + offset, NEWEST));

const page = (items: ThreadSummary[], nextCursor: string | null): ThreadPage => ({
  items,
  nextCursor,
});

const ids = (value: ThreadPage | undefined): string[] =>
  (value?.items ?? []).map((item) => item.id);

describe('appendPage', () => {
  it('appends the next page and moves the cursor on', () => {
    const appended = appendPage(page(threads(0, 3), 'c3'), page(threads(3, 5), 'c5'), 'c3');
    expect(ids(appended)).toEqual(ids(page(threads(0, 5), null)));
    expect(appended?.nextCursor).toBe('c5');
  });

  it('skips threads that are already loaded', () => {
    const appended = appendPage(page(threads(0, 3), 'c3'), page(threads(2, 4), null), 'c3');
    expect(ids(appended)).toEqual(ids(page(threads(0, 4), null)));
  });

  it('ignores a page fetched for a cursor the list no longer has', () => {
    const existing = page(threads(0, 3), 'c-new');
    expect(appendPage(existing, page(threads(3, 5), 'c5'), 'c3')).toBe(existing);
    expect(appendPage(undefined, page(threads(3, 5), 'c5'), 'c3')).toBeUndefined();
  });
});
