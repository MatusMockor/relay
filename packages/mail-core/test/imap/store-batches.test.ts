import { describe, expect, it } from 'vitest';
import { type FlagStoreClient, storeOnClient } from '../../src/imap/message-writes';

interface StoreCall {
  readonly kind: 'add' | 'remove';
  readonly uids: number[];
}

const recordingClient = (calls: StoreCall[]): FlagStoreClient => ({
  messageFlagsAdd: (range) => {
    calls.push({ kind: 'add', uids: range as number[] });
    return Promise.resolve(true);
  },
  messageFlagsRemove: (range) => {
    calls.push({ kind: 'remove', uids: range as number[] });
    return Promise.resolve(true);
  },
});

describe('IMAP flag store batches', () => {
  it('splits a long UID set into bounded STORE commands', async () => {
    const calls: StoreCall[] = [];

    await storeOnClient(
      recordingClient(calls),
      [1, 3, 5, 7, 9],
      { add: ['\\Seen'], remove: [] },
      2,
    );

    expect(calls).toEqual([
      { kind: 'add', uids: [1, 3] },
      { kind: 'add', uids: [5, 7] },
      { kind: 'add', uids: [9] },
    ]);
  });

  it('stores additions and removals per batch', async () => {
    const calls: StoreCall[] = [];
    const flags = { add: ['\\Seen'], remove: ['\\Flagged'] };

    await storeOnClient(recordingClient(calls), [4, 8, 12], flags, 2);

    expect(calls).toEqual([
      { kind: 'add', uids: [4, 8] },
      { kind: 'remove', uids: [4, 8] },
      { kind: 'add', uids: [12] },
      { kind: 'remove', uids: [12] },
    ]);
  });

  it('keeps a small UID set in one command', async () => {
    const calls: StoreCall[] = [];

    await storeOnClient(recordingClient(calls), [2, 6], { add: [], remove: ['\\Seen'] });

    expect(calls).toEqual([{ kind: 'remove', uids: [2, 6] }]);
  });
});
