import { withImap } from './imap-session';
import type { MailUser } from './mail-user';

export const subjectsIn = (user: MailUser, path: string): Promise<string[]> =>
  withImap(user, async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      if (client.mailbox === false || client.mailbox.exists === 0) {
        return [];
      }
      const subjects: string[] = [];
      for await (const message of client.fetch('1:*', { envelope: true })) {
        subjects.push(message.envelope?.subject ?? '');
      }
      return subjects;
    } finally {
      lock.release();
    }
  });

export const threadSubjectsIn = async (user: MailUser, path: string): Promise<string[]> =>
  [
    ...new Set((await subjectsIn(user, path)).map((subject) => subject.replace(/^Re: /, ''))),
  ].sort();
