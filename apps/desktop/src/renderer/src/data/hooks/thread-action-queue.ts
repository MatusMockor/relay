import type { ThreadId } from '@relay/shared';
import type { MailClient } from '../MailClient';

const chains = new WeakMap<MailClient, Map<ThreadId, Promise<unknown>>>();

const chainsOf = (client: MailClient): Map<ThreadId, Promise<unknown>> => {
  const existing = chains.get(client);
  if (existing !== undefined) {
    return existing;
  }
  const created = new Map<ThreadId, Promise<unknown>>();
  chains.set(client, created);
  return created;
};

export const serializedThreadAction = <T>(
  client: MailClient,
  threadId: ThreadId,
  work: () => Promise<T>,
): Promise<T> => {
  const clientChains = chainsOf(client);
  const next = (clientChains.get(threadId) ?? Promise.resolve()).then(work, work);
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  clientChains.set(threadId, settled);
  void settled.then(() => {
    if (clientChains.get(threadId) === settled) {
      clientChains.delete(threadId);
    }
  });
  return next;
};
