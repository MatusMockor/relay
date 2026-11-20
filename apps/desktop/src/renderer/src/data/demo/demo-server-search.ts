import type {
  ServerSearchHit,
  ServerSearchRequest,
  ServerSearchResponse,
  ServerSearchStatus,
} from '@relay/shared';
import type { ServerSearcher } from '../MailClient';
import { matchesDemoSearch } from './demo-search-match';
import type { DemoState, DemoThreadRecord } from './demo-state';

export interface DemoServerSearchOptions {
  readonly delayMs?: number;
  readonly offline?: () => boolean;
  readonly status?: () => ServerSearchStatus;
}

const DEFAULT_DELAY_MS = 900;

const hitOf = (record: DemoThreadRecord): ServerSearchHit[] => {
  const last = record.messages.at(-1);
  if (last === undefined) {
    return [];
  }
  return [{ thread: record.summary, messageId: last.id, date: last.date }];
};

const ingest = (state: DemoState, record: DemoThreadRecord): DemoThreadRecord => {
  if (!state.threads.has(record.summary.id)) {
    state.threads.set(record.summary.id, record);
  }
  return record;
};

const answer = (
  state: DemoState,
  request: ServerSearchRequest,
  status: ServerSearchStatus,
): ServerSearchResponse => {
  if (status !== 'ok' && status !== 'partial') {
    return { requestId: request.requestId, status, hits: [] };
  }
  const hits = [...state.archive.values()]
    .filter(
      (record) => request.accountId === undefined || record.summary.accountId === request.accountId,
    )
    .filter((record) => matchesDemoSearch(record, request))
    .sort((a, b) => Date.parse(b.summary.lastMessageAt) - Date.parse(a.summary.lastMessageAt))
    .map((record) => ingest(state, record))
    .flatMap(hitOf);
  return { requestId: request.requestId, status, hits };
};

const statusOf = (options: DemoServerSearchOptions): ServerSearchStatus => {
  if (options.offline?.() === true) {
    return 'offline';
  }
  return options.status?.() ?? 'ok';
};

export const createDemoServerSearch = (
  state: DemoState,
  options: DemoServerSearchOptions = {},
): ServerSearcher => ({
  searchServer: (request) =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve(answer(state, request, statusOf(options)));
      }, options.delayMs ?? DEFAULT_DELAY_MS);
    }),
});
