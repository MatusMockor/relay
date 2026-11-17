import { describe, expect, it } from 'vitest';
import { SCAN_THREAD_LIMIT, scanThreads } from '../src/data/hooks/thread-scan';
import type { MailClient } from '../src/data/MailClient';
import { cloneThread, seededClient } from './support/contact-pane';

const countingPages = (base: MailClient) => {
  const cursors: (string | undefined)[] = [];
  const client: MailClient = {
    ...base,
    listThreads: (params) => {
      cursors.push(params.cursor);
      return base.listThreads(params);
    },
  };
  return { client, cursors };
};

describe('scanThreads', () => {
  it('follows the cursor to the end and returns one deduplicated page', async () => {
    const { state, client: base } = seededClient();
    for (let index = 0; index < 250; index += 1) {
      cloneThread(state, 'Obed v piatok?', `scan-${String(index)}`, {});
    }
    const { client, cursors } = countingPages(base);

    const page = await scanThreads(client, { view: 'inbox' });

    expect(cursors).toEqual([undefined, '200']);
    expect(page.nextCursor).toBeNull();
    expect(new Set(page.items.map((item) => item.id)).size).toBe(page.items.length);
    expect(page.items.length).toBeGreaterThan(250);
  });

  it('stops at the thread cap so large inboxes stay bounded', async () => {
    const { state, client: base } = seededClient();
    for (let index = 0; index < 700; index += 1) {
      cloneThread(state, 'Obed v piatok?', `cap-${String(index)}`, {});
    }
    const { client, cursors } = countingPages(base);

    const page = await scanThreads(client, { view: 'inbox' });

    expect(page.items).toHaveLength(SCAN_THREAD_LIMIT);
    expect(cursors).toEqual([undefined, '200', '400']);
    expect(page.nextCursor).toBe('600');
  });
});
