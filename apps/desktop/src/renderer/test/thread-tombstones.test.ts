import type { ThreadPage } from '@relay/shared';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  forgetThreadRemoval,
  markThreadRemoved,
  removalMark,
  TOMBSTONE_LIMIT,
  withoutRemovedSince,
} from '../src/data/hooks/thread-tombstones';
import { bulkThread } from './support/bulk-demo-threads';

const NOW = new Date(2026, 10, 19, 12, 0);
const page: ThreadPage = {
  items: [bulkThread(0, NOW), bulkThread(1, NOW), bulkThread(2, NOW)],
  nextCursor: '3',
};
const ids = (value: ThreadPage): string[] => value.items.map((item) => item.id);

describe('thread tombstones', () => {
  it('drops threads removed after the request started', () => {
    const client = new QueryClient();
    const mark = removalMark(client);
    markThreadRemoved(client, bulkThread(1, NOW).id);

    expect(ids(withoutRemovedSince(client, mark, page))).toEqual([
      bulkThread(0, NOW).id,
      bulkThread(2, NOW).id,
    ]);
    expect(withoutRemovedSince(client, mark, page).nextCursor).toBe('3');
  });

  it('trusts a response requested after the removal', () => {
    const client = new QueryClient();
    markThreadRemoved(client, bulkThread(1, NOW).id);

    expect(withoutRemovedSince(client, removalMark(client), page)).toBe(page);
  });

  it('lets a thread that came back appear again', () => {
    const client = new QueryClient();
    const mark = removalMark(client);
    markThreadRemoved(client, bulkThread(1, NOW).id);
    forgetThreadRemoval(client, bulkThread(1, NOW).id);

    expect(withoutRemovedSince(client, mark, page)).toBe(page);
  });

  it('keeps only the most recent removals', () => {
    const client = new QueryClient();
    const mark = removalMark(client);
    markThreadRemoved(client, bulkThread(0, NOW).id);
    for (let index = 0; index < TOMBSTONE_LIMIT; index += 1) {
      markThreadRemoved(client, bulkThread(100 + index, NOW).id);
    }
    markThreadRemoved(client, bulkThread(2, NOW).id);

    expect(ids(withoutRemovedSince(client, mark, page))).toEqual([
      bulkThread(0, NOW).id,
      bulkThread(1, NOW).id,
    ]);
  });
});
