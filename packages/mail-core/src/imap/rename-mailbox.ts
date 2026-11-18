import type { RemoteMailbox } from '@relay/engine';
import type { ImapFlow } from 'imapflow';
import type { ImapConnection } from './imap-connection';
import { hasGmailLabels } from './gmail-labels';
import { toRemoteMailbox } from './list-mailboxes';

const listedAt = async (client: ImapFlow, path: string): Promise<RemoteMailbox> => {
  const listed = (await client.list()).find((mailbox) => mailbox.path === path);
  if (listed === undefined) {
    throw new Error(`Mailbox ${path} is not listed after RENAME`);
  }
  return toRemoteMailbox(listed, hasGmailLabels(client));
};

export const renameMailbox = (
  connection: ImapConnection,
  path: string,
  newPath: string,
): Promise<RemoteMailbox> =>
  connection.run({ operation: 'rename mailbox', retryOnDisconnect: false }, async (client) => {
    const renamed = await client.mailboxRename(path, newPath);
    await client.mailboxSubscribe(renamed.newPath).catch(() => false);
    await client.mailboxUnsubscribe(path).catch(() => false);
    return listedAt(client, renamed.newPath);
  });
