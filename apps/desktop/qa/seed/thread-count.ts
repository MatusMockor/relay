import type { SeedMessage } from './seed-message';

export const READY_ROWS = 20;

export const threadsWith = (
  messages: Iterable<SeedMessage>,
  counted: (message: SeedMessage) => boolean,
): number => {
  const roots = new Map<string, string>();
  const matching = new Set<string>();
  for (const message of messages) {
    const parent = message.inReplyTo === undefined ? undefined : roots.get(message.inReplyTo);
    const root = parent ?? message.messageId;
    roots.set(message.messageId, root);
    if (counted(message)) {
      matching.add(root);
    }
  }
  return matching.size;
};

export const readyRows = (threads: number): number => Math.min(READY_ROWS, threads);
