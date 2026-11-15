import type { RemoteMailbox } from '@relay/engine';
import type { ImapFlow } from 'imapflow';
import { z } from 'zod';
import type { ImapConnection } from './imap-connection';
import { isSelectable, toRemoteMailbox } from './list-mailboxes';

export interface MailboxNamespace {
  readonly prefix: string;
  readonly delimiter: string | null;
}

export const namespacedPath = (name: string, namespace: MailboxNamespace | null): string => {
  const prefix = namespace?.prefix ?? '';
  if (prefix === '' || name.startsWith(prefix)) {
    return name;
  }
  const delimiter = namespace?.delimiter ?? '';
  const separated = delimiter !== '' && !prefix.endsWith(delimiter);
  return `${prefix}${separated ? delimiter : ''}${name}`;
};

const NamespaceSchema = z.object({
  prefix: z.string(),
  delimiter: z.string().nullable().optional(),
});

export const clientNamespace = (client: ImapFlow): MailboxNamespace | null => {
  const parsed = NamespaceSchema.safeParse(Reflect.get(client, 'namespace'));
  return parsed.success
    ? { prefix: parsed.data.prefix, delimiter: parsed.data.delimiter ?? null }
    : null;
};

const findListed = async (client: ImapFlow, path: string): Promise<RemoteMailbox | null> => {
  const listed = (await client.list()).find((mailbox) => mailbox.path === path);
  if (listed === undefined) {
    return null;
  }
  if (!isSelectable(listed)) {
    throw new Error(`Mailbox ${path} exists but cannot hold messages`);
  }
  return toRemoteMailbox(listed);
};

const createListed = async (client: ImapFlow, path: string): Promise<RemoteMailbox> => {
  const created = await client.mailboxCreate(path).catch(async (error: unknown) => {
    if ((await findListed(client, path)) === null) {
      throw error;
    }
    return null;
  });
  if (created !== null) {
    await client.mailboxSubscribe(created.path).catch(() => false);
  }
  const listed = await findListed(client, created?.path ?? path);
  if (listed === null) {
    throw new Error(`Mailbox ${path} is not listed after CREATE`);
  }
  return listed;
};

export const createMailbox = (connection: ImapConnection, name: string): Promise<RemoteMailbox> =>
  connection.run({ operation: 'create mailbox', retryOnDisconnect: true }, async (client) => {
    const path = namespacedPath(name, clientNamespace(client));
    return (await findListed(client, path)) ?? createListed(client, path);
  });
