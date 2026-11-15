import type { RemoteMailboxStatus } from '@relay/engine';
import type { ImapConnection } from './imap-connection';

export const mailboxStatus = (
  connection: ImapConnection,
  path: string,
): Promise<RemoteMailboxStatus> =>
  connection.run({ operation: 'status', retryOnDisconnect: true }, async (client) => {
    const condstore = client.capabilities.has('CONDSTORE');
    const status = await client.status(path, {
      messages: true,
      uidNext: true,
      uidValidity: true,
      unseen: true,
      highestModseq: condstore,
    });
    return {
      path,
      uidValidity: Number(status.uidValidity ?? 0n),
      uidNext: status.uidNext ?? 1,
      highestModseq: status.highestModseq === undefined ? null : status.highestModseq.toString(),
      messages: status.messages ?? 0,
      unseen: status.unseen ?? 0,
    };
  });
