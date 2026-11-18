import type { StubMailbox } from './gmail-stub-data';

const within = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

export const renameMailboxes = (mailboxes: StubMailbox[], from: string, to: string): string[] => {
  mailboxes.forEach((mailbox, index) => {
    if (within(mailbox.path, from)) {
      mailboxes[index] = { ...mailbox, path: `${to}${mailbox.path.slice(from.length)}` };
    }
  });
  return [];
};

export const deleteMailbox = (mailboxes: StubMailbox[], path: string): string[] => {
  const index = mailboxes.findIndex((mailbox) => mailbox.path === path);
  if (index !== -1) {
    mailboxes.splice(index, 1);
  }
  return [];
};
