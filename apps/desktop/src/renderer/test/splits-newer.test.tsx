// @vitest-environment jsdom
import {
  isKeepSplitInput,
  type SplitEntry,
  SplitIdSchema,
  type SplitReplaceItem,
  type UnsupportedSplit,
} from '@relay/shared';
import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { demoClient, settle } from './features-support';
import { resetStores } from './support/render-app';
import { openSplits, splitNames } from './support/splits';

const NEWER: UnsupportedSplit = {
  kind: 'unsupported',
  id: SplitIdSchema.parse('split-newer'),
  accountId: null,
  name: 'Preklady',
  order: 3,
  exclusive: true,
  hideTasks: false,
};

interface NewerServer {
  readonly client: MailClient;
  readonly replaces: SplitReplaceItem[][];
}

const newerServer = (): NewerServer => {
  const demo = demoClient();
  const replaces: SplitReplaceItem[][] = [];
  let kept = true;
  const withNewer = (entries: SplitEntry[]): SplitEntry[] => (kept ? [...entries, NEWER] : entries);
  return {
    replaces,
    client: {
      ...demo,
      listSplits: async () => withNewer(await demo.listSplits()),
      replaceSplits: async (items) => {
        replaces.push(items);
        kept = items.some((item) => isKeepSplitInput(item) && item.id === NEWER.id);
        return withNewer(await demo.replaceSplits(items.filter((item) => !isKeepSplitInput(item))));
      },
    },
  };
};

describe('Nastavenia > Split Inbox > splity z novšej verzie', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('shows a newer split read-only and keeps it when other splits change', async () => {
    const server = newerServer();
    const sheet = await openSplits(server.client);

    const row = within(sheet).getByRole('listitem', { name: 'Split Preklady' });
    expect(row.getAttribute('aria-readonly')).toBe('true');
    expect(row.textContent).toContain('Len na čítanie');
    expect(within(row).queryByRole('button')).toBeNull();

    act(() => {
      fireEvent.keyDown(within(sheet).getByRole('button', { name: 'Presunúť split Jira' }), {
        key: 'ArrowDown',
        altKey: true,
      });
    });
    await settle();

    expect(server.replaces.at(-1)?.at(-1)).toEqual({ id: NEWER.id, keep: true });
    expect(splitNames(sheet)).toEqual([
      'Split Klienti',
      'Split Jira',
      'Split Ostatné',
      'Split Preklady',
    ]);
  });
});
