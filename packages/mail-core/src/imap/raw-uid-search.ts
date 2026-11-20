import type { ImapFlow } from 'imapflow';
import type { SearchAttribute } from './imap-search-attributes';
import { MAX_EXPANDED_UIDS, searchResultUids } from './search-response';

type UntaggedHandler = (untagged: unknown) => Promise<void>;

const finish = (response: unknown): void => {
  if (typeof response !== 'object' || response === null) {
    return;
  }
  const next: unknown = Reflect.get(response, 'next');
  if (typeof next === 'function') {
    Reflect.apply(next, response, []);
  }
};

const execute = async (
  client: ImapFlow,
  attributes: readonly SearchAttribute[],
  untagged: Record<string, UntaggedHandler>,
): Promise<void> => {
  const exec: unknown = Reflect.get(client, 'exec');
  if (typeof exec !== 'function') {
    throw new Error('The IMAP client cannot send a raw SEARCH command');
  }
  const response: unknown = await Reflect.apply(exec, client, [
    'UID SEARCH',
    attributes,
    { untagged },
  ]);
  finish(response);
};

export const rawUidSearch = async (
  client: ImapFlow,
  attributes: readonly SearchAttribute[],
): Promise<number[] | false> => {
  const found: number[] = [];
  const collect: UntaggedHandler = (untagged) => {
    found.push(...searchResultUids(untagged, MAX_EXPANDED_UIDS - found.length));
    return Promise.resolve();
  };
  try {
    await execute(client, attributes, { SEARCH: collect, ESEARCH: collect });
  } catch (error) {
    if (!client.usable) {
      throw error;
    }
    return false;
  }
  return found;
};
