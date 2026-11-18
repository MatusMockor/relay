import type { RemoteMailbox } from '../../../src';
import { CREATED_ROLES, missing, toRemote } from './fake-records';
import type { FakeMailbox, FakeMailServer } from './fake-mail-server';

const relabel = (server: FakeMailServer, from: string, to: string | null): void => {
  [...server.mailboxes.values()].forEach((mailbox) => {
    [...mailbox.messages.values()]
      .filter((record) => record.labels?.includes(from) === true)
      .forEach((record) => {
        const kept = (record.labels ?? []).filter((label) => label !== from);
        server.updateLabels(mailbox.path, record.uid, to === null ? kept : [...kept, to]);
      });
  });
};

export const createFakeMailbox = (server: FakeMailServer, name: string): RemoteMailbox => {
  server.createdMailboxes.push(name);
  const fallback = server.gmail ? 'label' : 'custom';
  const existing = server.find(name);
  return toRemote(existing ?? server.addMailbox(name, CREATED_ROLES.get(name) ?? fallback));
};

const within = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

const moveMailbox = (server: FakeMailServer, mailbox: FakeMailbox, newPath: string): void => {
  server.removeMailbox(mailbox.path);
  const moved = server.addMailbox(newPath, mailbox.role, mailbox.uidValidity);
  Object.assign(moved, { uidNext: mailbox.uidNext, highestModseq: mailbox.highestModseq });
  mailbox.messages.forEach((record, uid) => moved.messages.set(uid, record));
  if (server.gmail) {
    relabel(server, mailbox.path, newPath);
  }
};

export const renameFakeMailbox = (
  server: FakeMailServer,
  path: string,
  newPath: string,
): Promise<RemoteMailbox> => {
  if (server.find(path) === null || server.find(newPath) !== null) {
    return missing(`Mailbox ${path}`);
  }
  server.renamedMailboxes.push({ path, newPath });
  [...server.mailboxes.values()]
    .filter((mailbox) => within(mailbox.path, path))
    .forEach((mailbox) => {
      moveMailbox(server, mailbox, `${newPath}${mailbox.path.slice(path.length)}`);
    });
  return Promise.resolve(toRemote(server.mailbox(newPath)));
};

export const deleteFakeMailbox = (server: FakeMailServer, path: string): Promise<void> => {
  if (server.find(path) === null) {
    return missing(`Mailbox ${path}`);
  }
  server.deletedMailboxes.push(path);
  server.removeMailbox(path);
  if (server.gmail) {
    relabel(server, path, null);
  }
  return Promise.resolve();
};

export const purgeFakeKeyword = (
  server: FakeMailServer,
  path: string,
  keyword: string,
): Promise<void> => {
  const mailbox = server.find(path);
  if (mailbox === null) {
    return missing(`Mailbox ${path}`);
  }
  if (server.failKeywordPurge !== null) {
    return Promise.reject(new Error(server.failKeywordPurge));
  }
  server.keywordPurges.push({ path, keyword });
  [...mailbox.messages.values()]
    .filter((record) => record.keywords.includes(keyword))
    .forEach((record) => {
      server.updateKeywords(
        path,
        record.uid,
        record.keywords.filter((candidate) => candidate !== keyword),
      );
    });
  return Promise.resolve();
};
