import type { RemoteMailbox } from '@relay/engine';
import type { ImapFlow, ListResponse } from 'imapflow';
import { z } from 'zod';
import type { ImapConnection } from './imap-connection';
import { hasGmailLabels } from './gmail-labels';
import { detectMailboxRole } from './mailbox-roles';

const SubscribedSchema = z.literal(true);

const UNSELECTABLE_FLAGS = ['\\noselect', '\\nonexistent'];

export const isSelectable = (mailbox: ListResponse): boolean =>
  ![...mailbox.flags].some((flag) => UNSELECTABLE_FLAGS.includes(flag.toLowerCase()));

export const isSubscribed = (mailbox: ListResponse): boolean =>
  SubscribedSchema.safeParse(mailbox.subscribed).success;

const serverSpecialUse = (mailbox: ListResponse): string | null =>
  mailbox.specialUseSource === 'extension' && mailbox.specialUse ? mailbox.specialUse : null;

export const toRemoteMailbox = (mailbox: ListResponse, labels: boolean): RemoteMailbox => ({
  path: mailbox.path,
  name: mailbox.name,
  delimiter: mailbox.delimiter || null,
  role: detectMailboxRole({
    path: mailbox.path,
    name: mailbox.name,
    flags: mailbox.flags,
    specialUse: serverSpecialUse(mailbox),
    labels,
  }),
  subscribed: isSubscribed(mailbox),
});

export const listedMailboxes = async (client: ImapFlow): Promise<RemoteMailbox[]> => {
  const labels = hasGmailLabels(client);
  const mailboxes = await client.list();
  return mailboxes.filter(isSelectable).map((mailbox) => toRemoteMailbox(mailbox, labels));
};

export const listMailboxes = (connection: ImapConnection): Promise<RemoteMailbox[]> =>
  connection.run({ operation: 'list', retryOnDisconnect: true }, listedMailboxes);
