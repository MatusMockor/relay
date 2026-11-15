import type { RemoteMailbox } from '@relay/engine';
import type { ListResponse } from 'imapflow';
import type { ImapConnection } from './imap-connection';
import { detectMailboxRole } from './mailbox-roles';

const UNSELECTABLE_FLAGS = ['\\noselect', '\\nonexistent'];

export const isSelectable = (mailbox: ListResponse): boolean =>
  ![...mailbox.flags].some((flag) => UNSELECTABLE_FLAGS.includes(flag.toLowerCase()));

const serverSpecialUse = (mailbox: ListResponse): string | null =>
  mailbox.specialUseSource === 'extension' && mailbox.specialUse ? mailbox.specialUse : null;

export const toRemoteMailbox = (mailbox: ListResponse): RemoteMailbox => ({
  path: mailbox.path,
  name: mailbox.name,
  delimiter: mailbox.delimiter || null,
  role: detectMailboxRole({
    path: mailbox.path,
    name: mailbox.name,
    flags: mailbox.flags,
    specialUse: serverSpecialUse(mailbox),
  }),
  subscribed: mailbox.subscribed,
});

export const listMailboxes = (connection: ImapConnection): Promise<RemoteMailbox[]> =>
  connection.run({ operation: 'list', retryOnDisconnect: true }, async (client) => {
    const mailboxes = await client.list();
    return mailboxes.filter(isSelectable).map(toRemoteMailbox);
  });
