import { ProviderError } from '@relay/engine';
import type { MailboxObject } from 'imapflow';
import type { ImapConnection } from './imap-connection';
import { requireAccepted } from './imap-results';
import { type FlagNames, storeOnClient } from './message-writes';

const STORE = { operation: 'store keywords', retryOnDisconnect: true } as const;
const PURGE = { operation: 'purge keyword', retryOnDisconnect: true } as const;

export const UNSUPPORTED_KEYWORDS_MESSAGE = 'Server nepodporuje vlastné štítky';

const requireKeywordSupport = (mailbox: MailboxObject, keywords: readonly string[]): void => {
  const permanent = mailbox.permanentFlags;
  if (permanent === undefined || permanent.has('\\*')) {
    return;
  }
  if (keywords.every((keyword) => permanent.has(keyword))) {
    return;
  }
  throw new ProviderError(UNSUPPORTED_KEYWORDS_MESSAGE);
};

export const storeKeywords = async (
  connection: ImapConnection,
  path: string,
  uids: readonly number[],
  keywords: FlagNames,
): Promise<void> => {
  if (uids.length === 0 || (keywords.add.length === 0 && keywords.remove.length === 0)) {
    return;
  }
  await connection.withMailbox(path, STORE, async (client, mailbox) => {
    requireKeywordSupport(mailbox, keywords.add);
    await storeOnClient(client, uids, keywords);
  });
};

export const purgeKeyword = (
  connection: ImapConnection,
  path: string,
  keyword: string,
): Promise<void> =>
  connection.withMailbox(path, PURGE, async (client, mailbox) => {
    if (mailbox.exists === 0) {
      return;
    }
    requireAccepted(
      'purge keyword',
      await client.messageFlagsRemove('1:*', [keyword], { uid: true }),
    );
  });
