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
    if (newUid !== null) {
      uidMap.set(uid, newUid);
    }
  });
  if (server.partialMoves) {
    return Promise.reject(new PartialMoveError(mailbox.path, targetPath, uidMap));
  }
  return Promise.resolve({ uidMap: server.uidplus ? uidMap : new Map<number, number>() });
};
