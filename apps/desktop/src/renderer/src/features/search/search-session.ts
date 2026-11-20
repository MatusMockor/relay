import type { ThreadSummary } from '@relay/shared';

export type ResultSource = 'local' | 'server';

export interface SearchResult {
  readonly key: string;
  readonly source: ResultSource;
  readonly thread: ThreadSummary;
}

export interface SearchSession {
  readonly query: string;
  readonly localKeys: readonly string[];
  readonly serverKeys: readonly string[];
  readonly threads: ReadonlyMap<string, ThreadSummary>;
}

export const EMPTY_SESSION: SearchSession = {
  query: '',
  localKeys: [],
  serverKeys: [],
  threads: new Map(),
};

const withThreads = (
  threads: ReadonlyMap<string, ThreadSummary>,
  fresh: readonly ThreadSummary[],
): Map<string, ThreadSummary> => {
  const next = new Map(threads);
  fresh.forEach((thread) => next.set(thread.id, thread));
  return next;
};

export const mergeLocal = (
  session: SearchSession,
  query: string,
  threads: readonly ThreadSummary[],
): SearchSession => {
  if (query !== session.query) {
    return {
      query,
      localKeys: threads.map((thread) => thread.id),
      serverKeys: [],
      threads: withThreads(new Map(), threads),
    };
  }
  const present = new Set<string>(threads.map((thread) => thread.id));
  const kept = session.localKeys.filter((key) => present.has(key));
  const known = new Set([...kept, ...session.serverKeys]);
  const added = threads.map((thread) => thread.id).filter((key) => !known.has(key));
  return {
    ...session,
    localKeys: [...kept, ...added],
    threads: withThreads(session.threads, threads),
  };
};

export const mergeServer = (
  session: SearchSession,
  query: string,
  threads: readonly ThreadSummary[],
): SearchSession => {
  if (query !== session.query) {
    return session;
  }
  const known = new Set([...session.localKeys, ...session.serverKeys]);
  const added = [...new Set(threads.map((thread) => thread.id))].filter((key) => !known.has(key));
  return {
    ...session,
    serverKeys: [...session.serverKeys, ...added],
    threads: withThreads(session.threads, threads),
  };
};

const resultsOf = (
  session: SearchSession,
  keys: readonly string[],
  source: ResultSource,
): SearchResult[] =>
  keys.flatMap((key) => {
    const thread = session.threads.get(key);
    return thread === undefined ? [] : [{ key, source, thread }];
  });

export const localResults = (session: SearchSession): SearchResult[] =>
  resultsOf(session, session.localKeys, 'local');

export const serverResults = (session: SearchSession): SearchResult[] =>
  resultsOf(session, session.serverKeys, 'server');
