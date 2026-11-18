import type { ImapConnection } from './imap-connection';

export const deleteMailbox = (connection: ImapConnection, path: string): Promise<void> =>
  connection.run({ operation: 'delete mailbox', retryOnDisconnect: false }, async (client) => {
    await client.mailboxUnsubscribe(path).catch(() => false);
    await client.mailboxDelete(path);
  });
