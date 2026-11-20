import type { ThreadPage, ThreadSummary } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { appendPage, mergeHeadPage } from '../src/data/hooks/thread-pages';
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

describe('mergeHeadPage', () => {
  it('takes the fresh head when nothing is loaded yet', () => {
    const head = page(threads(0, 3), 'c3');
    expect(mergeHeadPage(undefined, head)).toBe(head);
  });

  it('keeps the loaded pages after the head boundary and their cursor', () => {
    const fresh = bulkThread(-1, NEWEST);
    const existing = page(threads(0, 6), 'c6');
    const head = page([fresh, ...threads(0, 2)], 'c2');
    const merged = mergeHeadPage(existing, head);
    expect(ids(merged)).toEqual(ids(page([fresh, ...threads(0, 6)], null)));
    expect(merged.nextCursor).toBe('c6');
  });

  it('drops a loaded thread that moved into the head instead of showing it twice', () => {
    const existing = page(threads(0, 6), 'c6');
    const moved = existing.items[4];
    expect(moved).toBeDefined();
    const head = page([...(moved === undefined ? [] : [moved]), ...threads(0, 2)], 'c2');
    const merged = mergeHeadPage(existing, head);
    expect(ids(merged).filter((id) => id === moved?.id)).toHaveLength(1);
    expect(merged.items).toHaveLength(6);
  });

  it('trusts the head alone when it covers the whole folder', () => {
    const head = page(threads(0, 2), null);
    expect(mergeHeadPage(page(threads(0, 6), 'c6'), head)).toBe(head);
  });

  it('trusts the head alone when its boundary is not among the loaded threads', () => {
    const head = page(threads(10, 12), 'c12');
    expect(mergeHeadPage(page(threads(0, 6), 'c6'), head)).toBe(head);
  });
});

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
