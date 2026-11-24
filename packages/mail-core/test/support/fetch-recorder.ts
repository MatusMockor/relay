import type { FetchQueryObject, ImapFlow } from 'imapflow';

export interface RecordedFetch {
  readonly uids: readonly number[];
  readonly bodyParts: readonly string[];
}

const bodyPartKeys = (query: FetchQueryObject): string[] =>
  (query.bodyParts ?? []).map((part) => (typeof part === 'string' ? part : part.key));

export const recordFetches =
  (calls: RecordedFetch[]) =>
  (client: ImapFlow): void => {
    const fetchAll = client.fetchAll.bind(client);
    client.fetchAll = (range, query, options) => {
      calls.push({ uids: Array.isArray(range) ? [...range] : [], bodyParts: bodyPartKeys(query) });
      return fetchAll(range, query, options);
    };
  };

export const previewFetches = (calls: readonly RecordedFetch[]): RecordedFetch[] =>
  calls.filter((call) => call.bodyParts.length > 0);
