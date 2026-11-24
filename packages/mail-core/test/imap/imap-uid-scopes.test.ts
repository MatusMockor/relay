import type { ImapFlow, SearchObject } from 'imapflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { uidRuns } from '../../src/imap/uid-scope';
import { summaryFixtures } from '../support/summary-fixtures';
import {
  appendFixture,
  createSummaryHarness,
  type SummaryHarness,
} from '../support/summary-harness';

const recordSearches = (searches: SearchObject[]) => (client: ImapFlow) => {
  const search = client.search.bind(client);
  client.search = (query, options) => {
    searches.push(query);
    return search(query, options);
  };
};

const appendMany = async (harness: SummaryHarness, count: number): Promise<number[]> => {
  const source = summaryFixtures()[0]?.source ?? new Uint8Array();
  const uids: number[] = [];
  for (let index = 0; index < count; index += 1) {
    uids.push(await appendFixture(harness, source));
  }
  return uids;
};

const expungeUid = async (harness: SummaryHarness, uid: number): Promise<void> => {
  const lock = await harness.admin.getMailboxLock('INBOX');
  try {
    await expect(harness.admin.messageDelete(String(uid), { uid: true })).resolves.toBe(true);
  } finally {
    lock.release();
  }
};

describe('ImapMailProvider.listUids scopes against GreenMail', () => {
  let harness: SummaryHarness;
  let searches: SearchObject[];

  beforeEach(async () => {
    searches = [];
    harness = await createSummaryHarness(recordSearches(searches));
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it('lists the newest messages by sequence number instead of searching the whole mailbox', async () => {
    const uids = await appendMany(harness, 6);
    await expungeUid(harness, uids[4] ?? 0);
    const remaining = uids.filter((uid) => uid !== uids[4]);

    await expect(harness.provider.listUids('INBOX', { newest: 3 })).resolves.toEqual(
      remaining.slice(-3),
    );
    await expect(harness.provider.listUids('INBOX', { newest: 50 })).resolves.toEqual(remaining);

    expect(searches).toEqual([{ seq: '3:5' }, { seq: '1:5' }]);
  });

  it('answers an empty mailbox without searching', async () => {
    await expect(harness.provider.listUids('INBOX', { newest: 5 })).resolves.toEqual([]);
    await expect(harness.provider.listUids('INBOX', { among: [] })).resolves.toEqual([]);

    expect(searches).toEqual([]);
  });

  it('returns only the given UIDs that still exist', async () => {
    const uids = await appendMany(harness, 5);
    const [first = 0, second = 0, third = 0, , fifth = 0] = uids;
    await expungeUid(harness, second);

    await expect(
      harness.provider.listUids('INBOX', { among: [fifth, first, second, third, fifth + 40] }),
    ).resolves.toEqual([first, third, fifth]);

    expect(searches).toEqual([
      { uid: uidRuns([first, second, third, fifth, fifth + 40]).join(',') },
    ]);
    expect(searches.some((query) => query.all === true)).toBe(false);
  });

  it('splits a sparse UID set into bounded searches and merges the answers', async () => {
    const uids = await appendMany(harness, 3);
    const sparse = Array.from({ length: 450 }, (_, index) => 1000 + index * 2);

    const found = await harness.provider.listUids('INBOX', { among: [...sparse, ...uids] });

    expect(found).toEqual(uids);
    expect(searches).toHaveLength(3);
  });
});

describe('uidRuns', () => {
  it('collapses consecutive UIDs into ranges', () => {
    expect(uidRuns([9, 3, 1, 2, 2, 7, 8, 12])).toEqual(['1:3', '7:9', '12']);
    expect(uidRuns([0, -4, 1.5])).toEqual([]);
  });
});

const rejectSequenceSearches = (searches: SearchObject[]) => (client: ImapFlow) => {
  const search = client.search.bind(client);
  client.search = (query, options) => {
    searches.push(query);
    return query.seq === undefined ? search(query, options) : Promise.resolve(false);
  };
};

describe('ImapMailProvider.listUids newest window fallback against GreenMail', () => {
  let harness: SummaryHarness;
  let searches: SearchObject[];

  beforeEach(async () => {
    searches = [];
    harness = await createSummaryHarness(rejectSequenceSearches(searches));
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it('falls back to a full search when the sequence search does not cover the window', async () => {
    const uids = await appendMany(harness, 5);

    await expect(harness.provider.listUids('INBOX', { newest: 2 })).resolves.toEqual(
      uids.slice(-2),
    );

    expect(searches).toEqual([{ seq: '4:5' }, { all: true }]);
  });
});
