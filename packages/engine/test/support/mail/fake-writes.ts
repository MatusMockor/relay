import { PartialMoveError, type MoveResult } from '../../../src';
import { missing } from './fake-records';
import type { FakeMailbox, FakeMailServer } from './fake-mail-server';

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
    const newUid =
      record === undefined ? null : server.tryDeliver(targetPath, record.source, record);
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
  if (server.partialMoves) {
    return Promise.reject(new PartialMoveError(mailbox.path, targetPath, uidMap));
  }
  return Promise.resolve({ uidMap: server.uidplus ? uidMap : new Map<number, number>() });
};
