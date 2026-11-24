import type { IMAPServer } from 'imapkit';
import {
  folderOfLabel,
  GMAIL,
  isAllMail,
  isBin,
  isLabelFolder,
  labelOfFolder,
} from './gmail-layout';
import {
  copiesOf,
  findCopy,
  labelsOf,
  type MessageCopy,
  msgidOf,
  withoutAllLabel,
  writeLabels,
} from './gmail-message';

const LOCAL_FLAGS: ReadonlySet<string> = new Set(['\\recent', '\\deleted']);

const expunge = (server: IMAPServer, copies: readonly MessageCopy[]): void => {
  copies.forEach((copy) => {
    server.control.expungeMessages(copy.mailbox.path, [copy.message.uid]);
  });
};

const ensureIn = (server: IMAPServer, source: MessageCopy, path: string): void => {
  if (copiesOf(server, msgidOf(source.message)).some((copy) => copy.mailbox.path === path)) {
    return;
  }
  if (server.getMailbox(path) === undefined) {
    server.control.createMailbox(path);
  }
  server.control.copyMessages(source.mailbox.path, [source.message.uid], path);
};

const preservedLabels = (copies: readonly MessageCopy[]): string[] =>
  copies
    .flatMap((copy) => labelsOf(copy.message))
    .filter((label) => label.startsWith('\\') && folderOfLabel(label) === null);

export const syncLabels = (server: IMAPServer, msgid: string): void => {
  const copies = copiesOf(server, msgid);
  const folders = copies.filter((copy) => !isAllMail(copy.mailbox.path));
  const labels = [
    ...new Set([
      ...folders.map((copy) => labelOfFolder(copy.mailbox.path)),
      ...preservedLabels(copies),
    ]),
  ].sort();
  copies.forEach((copy) => {
    writeLabels(copy, labels);
  });
};

const moveToBin = (server: IMAPServer, msgid: string, kept: MessageCopy): void => {
  expunge(
    server,
    copiesOf(server, msgid).filter((copy) => copy.message !== kept.message),
  );
  writeLabels(kept, [labelOfFolder(kept.mailbox.path)]);
};

const placeInAllMail = (server: IMAPServer, msgid: string, added: MessageCopy): void => {
  const others = copiesOf(server, msgid).filter(
    (copy) => isAllMail(copy.mailbox.path) && copy.message !== added.message,
  );
  if (others.length > 0) {
    expunge(server, [added]);
  }
};

export const onAppended = (server: IMAPServer, msgid: string, path: string, uid: number): void => {
  const added = findCopy(server, path, uid);
  if (added === null) {
    return;
  }
  if (isBin(path)) {
    moveToBin(server, msgid, added);
    return;
  }
  expunge(
    server,
    copiesOf(server, msgid).filter((copy) => isBin(copy.mailbox.path)),
  );
  if (isAllMail(path)) {
    placeInAllMail(server, msgid, added);
  }
  ensureIn(server, added, GMAIL.allMail);
  syncLabels(server, msgid);
};

export const onExpunged = (server: IMAPServer, msgid: string, path: string): void => {
  if (isAllMail(path)) {
    expunge(
      server,
      copiesOf(server, msgid).filter((copy) => isLabelFolder(copy.mailbox.path)),
    );
  }
  syncLabels(server, msgid);
};

export const onLabelsStored = (
  server: IMAPServer,
  msgid: string,
  path: string,
  uid: number,
): void => {
  const source = findCopy(server, path, uid);
  if (source === null) {
    return;
  }
  const wanted = withoutAllLabel(labelsOf(source.message));
  const folders = wanted.map(folderOfLabel).filter((folder): folder is string => folder !== null);
  const bin = folders.find(isBin);
  if (bin !== undefined) {
    ensureIn(server, source, bin);
    const kept = copiesOf(server, msgid).find((copy) => copy.mailbox.path === bin);
    moveToBin(server, msgid, kept ?? source);
    return;
  }
  ensureIn(server, source, GMAIL.allMail);
  folders.forEach((folder) => {
    ensureIn(server, source, folder);
  });
  expunge(
    server,
    copiesOf(server, msgid).filter(
      (copy) => isLabelFolder(copy.mailbox.path) && !folders.includes(copy.mailbox.path),
    ),
  );
  syncLabels(server, msgid);
};

const sharedFlags = (flags: readonly string[]): string[] =>
  flags.filter((flag) => !LOCAL_FLAGS.has(flag.toLowerCase()));

export const onFlagsStored = (
  server: IMAPServer,
  msgid: string,
  path: string,
  uid: number,
): void => {
  const source = findCopy(server, path, uid);
  if (source === null) {
    return;
  }
  const wanted = sharedFlags(source.message.flags);
  copiesOf(server, msgid)
    .filter((copy) => copy.message !== source.message)
    .forEach((copy) => {
      const local = copy.message.flags.filter((flag) => flag.toLowerCase() === '\\deleted');
      server.control.setFlags(copy.mailbox.path, [copy.message.uid], [...wanted, ...local], 'set');
    });
};
