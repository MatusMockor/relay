import type { QueryClient } from '@tanstack/react-query';

export const THREADS_CHANGED_THROTTLE_MS = 2_000;

interface ThrottleSlot {
  trailing: (() => void) | null;
}

const windows = new WeakMap<QueryClient, Map<string, ThrottleSlot>>();

const windowsOf = (client: QueryClient): Map<string, ThrottleSlot> => {
  const existing = windows.get(client);
  if (existing !== undefined) {
    return existing;
  }
  const created = new Map<string, ThrottleSlot>();
  windows.set(client, created);
  return created;
};

export const throttleByKey = (
  client: QueryClient,
  key: string,
  run: () => void,
  windowMs = THREADS_CHANGED_THROTTLE_MS,
): void => {
  const open = windowsOf(client);
  const current = open.get(key);
  if (current !== undefined) {
    current.trailing = run;
    return;
  }
  run();
  const slot: ThrottleSlot = { trailing: null };
  open.set(key, slot);
  setTimeout(() => {
    open.delete(key);
    const trailing = slot.trailing;
    if (trailing === null) {
      return;
    }
    throttleByKey(client, key, trailing, windowMs);
  }, windowMs);
};
