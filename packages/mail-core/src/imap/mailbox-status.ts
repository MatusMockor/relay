import type { RemoteMailboxStatus } from '@relay/engine';
import type { ImapFlow, StatusObject } from 'imapflow';
import type { ImapConnection } from './imap-connection';
import { requireAccepted } from './imap-results';

export type StatusClient = Pick<ImapFlow, 'capabilities' | 'status'>;

export const statusOnClient = async (
  client: StatusClient,
  path: string,
): Promise<RemoteMailboxStatus> => {
  const response: StatusObject | false = await client.status(path, {
    messages: true,
    uidNext: true,
    uidValidity: true,
    unseen: true,
    highestModseq: client.capabilities.has('CONDSTORE'),
  });
  const status = requireAccepted('status', response);
  return {
    path,
    uidValidity: Number(status.uidValidity ?? 0n),
    uidNext: status.uidNext ?? 1,
    highestModseq: status.highestModseq === undefined ? null : status.highestModseq.toString(),
    messages: status.messages ?? 0,
    unseen: status.unseen ?? 0,
  };
};

export const mailboxStatus = (
  connection: ImapConnection,
  path: string,
): Promise<RemoteMailboxStatus> =>
  connection.run({ operation: 'status', retryOnDisconnect: true }, (client) =>
    statusOnClient(client, path),
  );
