import { NotImplementedError, PartialMoveError, type MoveResult } from '../../../src';
import { missing } from './fake-records';
import type { FakeMailbox, FakeMailServer, RemoteMessageRecord } from './fake-mail-server';

export interface KeywordMutation {
  readonly add: readonly string[];
  readonly remove: readonly string[];
}

export const applyKeywords = (
  mailbox: FakeMailbox,
  server: FakeMailServer,
  uids: readonly number[],
  mutation: KeywordMutation,
): void => {
  uids.forEach((uid) => {
    const current = mailbox.messages.get(uid)?.keywords ?? [];
    const next = [...new Set([...current, ...mutation.add])].filter(
      (keyword) => !mutation.remove.includes(keyword),
    );
    server.updateKeywords(mailbox.path, uid, next);
  });
};

const sameMessage = (server: FakeMailServer, emailId: string) =>
  [...server.mailboxes.values()].flatMap((candidate) =>
    [...candidate.messages.values()]
      .filter((record) => record.emailId === emailId)
      .map((record) => ({ path: candidate.path, record })),
  );

export const writeLabels = (
  mailbox: FakeMailbox,
  server: FakeMailServer,
  uids: readonly number[],
  mutation: KeywordMutation,
): Promise<void> => {
  if (!server.gmail) {
    return Promise.reject(new NotImplementedError('Gmail labels'));
  }
  server.labelWrites.push({ path: mailbox.path, uids: [...uids], ...mutation });
  uids.forEach((uid) => {
    const record = mailbox.messages.get(uid);
    if (record?.emailId === null || record === undefined) {
      return;
    }
    const next = [...new Set([...(record.labels ?? []), ...mutation.add])].filter(
      (label) => !mutation.remove.includes(label),
    );
    sameMessage(server, record.emailId).forEach(({ path, record: copy }) => {
      server.updateLabels(path, copy.uid, next);
    });
  });
  return Promise.resolve();
};

const GMAIL_HELD_ROLES: ReadonlySet<string> = new Set(['trash', 'spam']);
const GMAIL_LABEL_ROLES: ReadonlySet<string> = new Set(['inbox', 'archive']);

const sameSource = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const dropGmailLabels = (server: FakeMailServer, targetPath: string, source: Uint8Array) => {
  if (!server.gmail || !GMAIL_HELD_ROLES.has(server.find(targetPath)?.role ?? '')) {
    return;
  }
  [...server.mailboxes.values()]
    .filter((candidate) => GMAIL_LABEL_ROLES.has(candidate.role))
    .forEach((candidate) => {
      [...candidate.messages.values()]
        .filter((record) => sameSource(record.source, source))
        .forEach((record) => {
          server.expunge(candidate.path, record.uid);
        });
    });
};

const gmailTwin = (server: FakeMailServer, targetPath: string, emailId: string | null) => {
  if (!server.gmail || emailId === null) {
    return null;
  }
  const target = server.find(targetPath);
  return (
    [...(target?.messages.values() ?? [])].find((record) => record.emailId === emailId) ?? null
  );
};

const copyRecord = (
  server: FakeMailServer,
  targetPath: string,
  record: RemoteMessageRecord | undefined,
): number | null => {
  if (record === undefined) {
    return null;
  }
  const twin = gmailTwin(server, targetPath, record.emailId);
  return twin === null ? server.tryDeliver(targetPath, record.source, record) : twin.uid;
};

export const moveRecords = (
  mailbox: FakeMailbox,
  server: FakeMailServer,
  uids: readonly number[],
  targetPath: string,
): Promise<MoveResult> => {
  if (server.find(targetPath) === null) {
    return missing(`Mailbox ${targetPath}`);
  }
  const uidMap = new Map<number, number>();
  uids.forEach((uid) => {
    const record = mailbox.messages.get(uid);
    const newUid = copyRecord(server, targetPath, record);
    if (newUid !== null && !server.partialMoves) {
      server.expunge(mailbox.path, uid);
    }
    if (record !== undefined && newUid !== null && !server.partialMoves) {
      dropGmailLabels(server, targetPath, record.source);
    }
    if (newUid !== null) {
      uidMap.set(uid, newUid);
    }
  });
  server.afterMove?.(mailbox.path);
  if (server.partialMoves) {
    return Promise.reject(new PartialMoveError(mailbox.path, targetPath, uidMap));
  }
  return Promise.resolve({ uidMap: server.uidplus ? uidMap : new Map<number, number>() });
};
