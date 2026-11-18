import type { FakeMailbox, FakeMailServer } from './fake-mail-server';

export const renameFakeMailbox = (server: FakeMailServer, from: string, to: string): void => {
  const renamed = [...server.mailboxes.values()].filter(
    (mailbox) => mailbox.path === from || mailbox.path.startsWith(`${from}/`),
  );
  renamed.forEach((mailbox) => {
    const path = `${to}${mailbox.path.slice(from.length)}`;
    const moved: FakeMailbox = { ...mailbox, path, name: path.split('/').pop() ?? path };
    server.mailboxes.delete(mailbox.path);
    server.mailboxes.set(path, moved);
  });
};
