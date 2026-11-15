import type { QueryClient, QueryKey } from '@tanstack/react-query';

export const INVALIDATION_WINDOW_MS = 50;

const pending = new WeakMap<QueryClient, Map<string, QueryKey>>();

export const invalidateBatched = (client: QueryClient, key: QueryKey): void => {
  const queued = pending.get(client);
  if (queued !== undefined) {
    queued.set(JSON.stringify(key), key);
    return;
  }
  const keys = new Map<string, QueryKey>([[JSON.stringify(key), key]]);
  pending.set(client, keys);
  setTimeout(() => {
    pending.delete(client);
    keys.forEach((queryKey) => {
      void client.invalidateQueries({ queryKey });
    });
  }, INVALIDATION_WINDOW_MS);
};
