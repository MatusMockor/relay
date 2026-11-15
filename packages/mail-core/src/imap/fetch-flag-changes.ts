import type { RemoteFlagChange } from '@relay/engine';
import type { FetchOptions, MailboxObject } from 'imapflow';
import type { ImapConnection } from './imap-connection';
import { toKeywords, toMessageFlags } from './message-flags';

const READ = { operation: 'fetch flags', retryOnDisconnect: true } as const;

const parseModseq = (value: string): bigint | null => {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  return BigInt(value);
};

export const flagFetchOptions = (mailbox: MailboxObject, sinceModseq: string): FetchOptions => {
  const since = parseModseq(sinceModseq);
  if (mailbox.highestModseq === undefined || mailbox.noModseq === true || since === null) {
    return { uid: true };
  }
  return { uid: true, changedSince: since };
};

export const fetchFlagChanges = (
  connection: ImapConnection,
  path: string,
  sinceModseq: string,
): Promise<RemoteFlagChange[]> =>
  connection.withMailbox(path, READ, async (client, mailbox) => {
    if (mailbox.exists === 0) {
      return [];
    }
    const fetched = await client.fetchAll(
      '1:*',
      { uid: true, flags: true },
      flagFetchOptions(mailbox, sinceModseq),
    );
    return fetched
      .map((message) => ({
        uid: message.uid,
        flags: toMessageFlags(message.flags),
        keywords: toKeywords(message.flags),
        modseq: message.modseq === undefined ? null : message.modseq.toString(),
      }))
      .sort((left, right) => left.uid - right.uid);
  });
