import type { MessageFlags } from '@relay/shared/domain';
import type { AppendResult, RemoteMailbox } from '../../../src';
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

export const createFakeMailbox = (
  server: FakeMailServer,
  name: string,
  parentPath?: string,
): Promise<RemoteMailbox> => {
  if (parentPath !== undefined && server.find(parentPath) === null) {
    return missing(`Parent mailbox ${parentPath}`);
  }
  const path = parentPath === undefined ? name : `${parentPath}/${name}`;
  server.createdMailboxes.push(path);
  server.folderCommands.push(`CREATE ${path}`);
  const fallback = server.gmail ? 'label' : 'custom';
  const existing = server.find(path);
  return Promise.resolve(
    toRemote(existing ?? server.addMailbox(path, CREATED_ROLES.get(path) ?? fallback)),
  );
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
  server.folderCommands.push(`RENAME ${path} ${newPath}`);
  [...server.mailboxes.values()]
    .filter((mailbox) => within(mailbox.path, path))
    .forEach((mailbox) => {
      moveMailbox(server, mailbox, `${newPath}${mailbox.path.slice(path.length)}`);
    });
  const renamed = server.mailbox(newPath);
  renamed.subscribed = true;
  return Promise.resolve(toRemote(renamed));
};

export const deleteFakeMailbox = (server: FakeMailServer, path: string): Promise<void> => {
  if (server.find(path) === null) {
    return missing(`Mailbox ${path}`);
  }
  server.deletedMailboxes.push(path);
  server.folderCommands.push(`DELETE ${path}`);
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

export const appendFakeRecord = (
  server: FakeMailServer,
  mailbox: FakeMailbox,
  source: Uint8Array,
  flags: Partial<MessageFlags>,
): AppendResult => {
  const uid = server.tryDeliver(mailbox.path, source, { flags });
  return server.uidplus
    ? { uid, uidValidity: mailbox.uidValidity }
    : { uid: null, uidValidity: null };
};
