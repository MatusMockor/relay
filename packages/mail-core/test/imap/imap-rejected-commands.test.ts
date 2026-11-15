import { ProviderError } from '@relay/engine';
import type { StatusObject } from 'imapflow';
import { describe, expect, it } from 'vitest';
import { statusOnClient, type StatusClient } from '../../src/imap/mailbox-status';
import { moveOnClient, type MoveClient } from '../../src/imap/message-move';
import { storeOnClient, type FlagStoreClient } from '../../src/imap/message-writes';
import { searchUids, type SearchClient } from '../../src/imap/uid-batches';

const resolved =
  <Value>(value: Value) =>
  () =>
    Promise.resolve(value);

const storeClient = (added: boolean, removed: boolean): FlagStoreClient => ({
  messageFlagsAdd: resolved(added),
  messageFlagsRemove: resolved(removed),
});

const statusClient = (status: StatusObject | false): StatusClient => ({
  capabilities: new Map(),
  status: () => Promise.resolve(status as StatusObject),
});

const searchClient = (found: number[] | false): SearchClient => ({ search: resolved(found) });

describe('IMAP commands rejected by the server', () => {
  it('fails a flag store when either STORE is rejected', async () => {
    const flags = { add: ['\\Seen'], remove: ['\\Flagged'] };

    await expect(storeOnClient(storeClient(false, true), [1], flags)).rejects.toBeInstanceOf(
      ProviderError,
    );
    await expect(storeOnClient(storeClient(true, false), [1], flags)).rejects.toBeInstanceOf(
      ProviderError,
    );
    await expect(storeOnClient(storeClient(true, true), [1], flags)).resolves.toBeUndefined();
  });

  it('fails a STATUS that is rejected instead of reporting defaults', async () => {
    await expect(statusOnClient(statusClient(false), 'INBOX')).rejects.toThrow(
      /IMAP status was rejected/,
    );
    await expect(
      statusOnClient(statusClient({ path: 'INBOX', messages: 3, uidNext: 4 }), 'INBOX'),
    ).resolves.toMatchObject({ messages: 3, uidNext: 4 });
  });

  it('fails a rejected SEARCH and keeps an empty result distinct', async () => {
    await expect(searchUids(searchClient(false), { all: true })).rejects.toThrow(
      /IMAP search was rejected/,
    );
    await expect(searchUids(searchClient([]), { all: true })).resolves.toEqual([]);
    await expect(searchUids(searchClient([5, 3, 3, 1]), { uid: '2:*' }, 2)).resolves.toEqual([
      3, 5,
    ]);
  });

  const fallbackClient = (
    flagged: boolean,
    expunged: boolean,
    calls: string[] = [],
  ): MoveClient => ({
    capabilities: new Map([['UIDPLUS', true]]),
    enabled: new Set(),
    mailbox: false,
    messageMove: resolved(false),
    messageCopy: resolved({ path: 'INBOX', destination: 'Archive' }),
    messageFlagsAdd: () => {
      calls.push('store');
      return Promise.resolve(flagged);
    },
    messageDelete: () => {
      calls.push('expunge');
      return Promise.resolve(expunged);
    },
  });

  it('fails the UIDPLUS move fallback when marking the source as deleted is rejected', async () => {
    const calls: string[] = [];

    await expect(moveOnClient(fallbackClient(false, true, calls), [1], 'Archive')).rejects.toThrow(
      /IMAP store flags was rejected/,
    );
    expect(calls).toEqual(['store']);
  });

  it('fails a rejected UID EXPUNGE of the UIDPLUS move fallback', async () => {
    await expect(moveOnClient(fallbackClient(true, false), [1], 'Archive')).rejects.toThrow(
      /IMAP expunge was rejected/,
    );
  });
});
