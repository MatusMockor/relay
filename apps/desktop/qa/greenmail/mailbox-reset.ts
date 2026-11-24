import type { ImapFlow } from 'imapflow';
import { withImap } from './imap-session';
import type { MailUser } from './mail-user';

const INBOX = 'INBOX';

const emptyInbox = async (client: ImapFlow): Promise<void> => {
  const lock = await client.getMailboxLock(INBOX);
  try {
    if (client.mailbox === false || client.mailbox.exists === 0) {
      return;
    }
    await client.messageDelete('1:*');
  } finally {
    lock.release();
  }
};

export const resetMailboxes = (user: MailUser): Promise<void> =>
  withImap(user, async (client) => {
    const mailboxes = await client.list();
    const removable = mailboxes
      .map((mailbox) => mailbox.path)
      .filter((path) => path.toUpperCase() !== INBOX)
      .sort((left, right) => right.length - left.length);
    for (const path of removable) {
      await client.mailboxDelete(path);
    }
    await emptyInbox(client);
  });
