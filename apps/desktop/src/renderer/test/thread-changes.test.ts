import type { ThreadPage } from '@relay/shared';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  type ThreadChanges,
  reconcilePage,
  recordThreadChange,
  whileWatchingChanges,
} from '../src/data/hooks/thread-changes';
import { threadListParams } from '../src/data/hooks/use-mail-queries';
import { bulkThread } from './support/bulk-demo-threads';

const NOW = new Date(2026, 10, 19, 12, 0);
const INBOX = threadListParams({ view: 'inbox' });
const page: ThreadPage = {
  items: [bulkThread(0, NOW), bulkThread(1, NOW), bulkThread(2, NOW)],
  nextCursor: '3',
};
const ids = (value: ThreadPage): string[] => value.items.map((item) => item.id);

const readWhile = (client: QueryClient, during: () => void): Promise<ThreadPage> =>
  whileWatchingChanges(
    client,
    () => {
      during();
      return Promise.resolve(page);
    },
    (read: ThreadPage, changes: ThreadChanges) => reconcilePage(INBOX, read, changes),
  );

describe('thread changes during a list read', () => {
  it('drops threads removed while the request was in flight', async () => {
    const client = new QueryClient();
    const read = await readWhile(client, () => {
      recordThreadChange(client, bulkThread(1, NOW).id, null);
    });

    expect(ids(read)).toEqual([bulkThread(0, NOW).id, bulkThread(2, NOW).id]);
    expect(read.nextCursor).toBe('3');
  });

  it('drops a thread archived during the request and refreshes one that still belongs', async () => {
    const client = new QueryClient();
    const read = await readWhile(client, () => {
      recordThreadChange(client, bulkThread(0, NOW).id, { ...bulkThread(0, NOW), state: 'done' });
      recordThreadChange(client, bulkThread(2, NOW).id, { ...bulkThread(2, NOW), unread: true });
    });

    expect(ids(read)).toEqual([bulkThread(1, NOW).id, bulkThread(2, NOW).id]);
    expect(read.items[1]?.unread).toBe(true);
  });

  it('never brings back a thread however many others were removed during the request', async () => {
    const client = new QueryClient();
    const read = await readWhile(client, () => {
      recordThreadChange(client, bulkThread(1, NOW).id, null);
      for (let index = 0; index < 5_000; index += 1) {
        recordThreadChange(client, bulkThread(100 + index, NOW).id, null);
      }
    });

    expect(ids(read)).not.toContain(bulkThread(1, NOW).id);
  });

  it('applies the latest change when a removed thread came back', async () => {
    const client = new QueryClient();
    const read = await readWhile(client, () => {
      recordThreadChange(client, bulkThread(1, NOW).id, null);
      recordThreadChange(client, bulkThread(1, NOW).id, bulkThread(1, NOW));
    });

    expect(read).toEqual(page);
  });

  it('ignores changes recorded outside the request', async () => {
    const client = new QueryClient();
    recordThreadChange(client, bulkThread(1, NOW).id, null);
    await readWhile(client, () => undefined);
    const read = await readWhile(client, () => undefined);
    recordThreadChange(client, bulkThread(2, NOW).id, null);

    expect(read).toBe(page);
  });
});
