import type { ImapFlow } from 'imapflow';
import { expect } from 'vitest';

export const latestSource = async (client: ImapFlow, path: string): Promise<Uint8Array> => {
  const lock = await client.getMailboxLock(path);
  try {
    const mailbox = client.mailbox;
    const exists = mailbox === false ? 0 : mailbox.exists;
    expect(exists).toBeGreaterThan(0);
    const message = await client.fetchOne(String(exists), { source: true });
    expect(message === false ? undefined : message.source).toBeDefined();
    return new Uint8Array(message === false ? [] : (message.source ?? []));
  } finally {
    lock.release();
  }
};

export const waitForSource = async (
  client: ImapFlow,
  path: string,
  timeoutMs = 10_000,
): Promise<Uint8Array> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await client.status(path, { messages: true });
    if ((status.messages ?? 0) > 0) {
      return latestSource(client, path);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return latestSource(client, path);
};
