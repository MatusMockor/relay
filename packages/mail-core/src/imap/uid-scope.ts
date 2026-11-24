import type { UidListOptions, UidRange } from '@relay/engine';
import type { ImapFlow, SearchObject } from 'imapflow';
import { chunk, type SearchClient, searchUids, sortedUids } from './uid-batches';

const RUNS_PER_SEARCH = 200;

const isEmptyRange = (range: UidRange): boolean =>
  !Number.isInteger(range.from) ||
  !Number.isInteger(range.to) ||
  range.from < 1 ||
  range.to < range.from;

const runOf = (low: number, high: number): string =>
  low === high ? String(low) : `${String(low)}:${String(high)}`;

export const uidRuns = (uids: readonly number[]): string[] => {
  const runs: { low: number; high: number }[] = [];
  for (const uid of sortedUids(uids.filter(Number.isInteger))) {
    const last = runs.at(-1);
    if (last !== undefined && last.high === uid - 1) {
      last.high = uid;
      continue;
    }
    runs.push({ low: uid, high: uid });
  }
  return runs.map(({ low, high }) => runOf(low, high));
};

const newestQueries = (newest: number, exists: number): SearchObject[] => {
  if (!Number.isInteger(newest) || newest < 1 || exists === 0) {
    return [];
  }
  return [{ seq: `${String(Math.max(1, exists - newest + 1))}:${String(exists)}` }];
};

export const scopeQueries = (options: UidListOptions, exists: number): SearchObject[] => {
  if (options.among !== undefined) {
    return chunk(uidRuns(options.among), RUNS_PER_SEARCH).map((runs) => ({ uid: runs.join(',') }));
  }
  if (options.newest !== undefined) {
    return newestQueries(options.newest, exists);
  }
  if (options.range === undefined) {
    return [{ all: true }];
  }
  if (isEmptyRange(options.range)) {
    return [];
  }
  return [{ uid: `${String(options.range.from)}:${String(options.range.to)}` }];
};

export const searchScope = async (
  client: SearchClient,
  queries: readonly SearchObject[],
): Promise<number[]> => {
  const [only] = queries;
  if (only === undefined) {
    return [];
  }
  if (queries.length === 1) {
    return searchUids(client, only);
  }
  let found: number[] = [];
  for (const query of queries) {
    found = found.concat(await searchUids(client, query));
  }
  return sortedUids(found);
};

export const existsOf = (client: Pick<ImapFlow, 'mailbox'>): number =>
  client.mailbox === false ? 0 : client.mailbox.exists;
