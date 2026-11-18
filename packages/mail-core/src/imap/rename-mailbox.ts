import type { RemoteMailbox } from '@relay/engine';
import type { ImapFlow, ListResponse } from 'imapflow';
import { findListed } from './create-mailbox';
import type { ImapConnection } from './imap-connection';
import { isSubscribed } from './list-mailboxes';

const treeOf = (mailboxes: readonly ListResponse[], path: string): ListResponse[] => {
  const root = mailboxes.find((mailbox) => mailbox.path === path);
  if (root === undefined) {
    throw new Error(`Mailbox ${path} does not exist`);
  }
  const prefix = root.delimiter ? `${path}${root.delimiter}` : null;
  return mailboxes.filter(
    (mailbox) => mailbox.path === path || (prefix !== null && mailbox.path.startsWith(prefix)),
  );
};

const subscribedPaths = (tree: readonly ListResponse[], path: string): string[] => [
  path,
  ...tree
    .filter((mailbox) => mailbox.path !== path && isSubscribed(mailbox))
    .map((mailbox) => mailbox.path),
];

const moveSubscriptions = async (
  client: ImapFlow,
  paths: readonly string[],
  from: string,
  to: string,
): Promise<void> => {
  for (const path of paths) {
    await client.mailboxSubscribe(`${to}${path.slice(from.length)}`).catch(() => false);
    await client.mailboxUnsubscribe(path).catch(() => false);
  }
};

export const renameMailbox = (
  connection: ImapConnection,
  path: string,
  newPath: string,
): Promise<RemoteMailbox> =>
  connection.run({ operation: 'rename mailbox', retryOnDisconnect: false }, async (client) => {
    const subscribed = subscribedPaths(treeOf(await client.list(), path), path);
    await client.mailboxRename(path, newPath);
    await moveSubscriptions(client, subscribed, path, newPath);
    const listed = await findListed(client, newPath);
    if (listed === null) {
      throw new Error(`Mailbox ${newPath} is not listed after RENAME`);
    }
    return listed;
  });
