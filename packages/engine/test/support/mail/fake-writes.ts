import type { MessageFlags } from '@relay/shared/domain';
import {
  type FlagMutation,
  NotImplementedError,
  PartialMoveError,
  type MoveResult,
} from '../../../src';
import { stateOfRecord } from './fake-gmail-messages';
import { moveGmailRecord, relabelMemberships } from './fake-gmail-moves';
import { missing } from './fake-records';
import type { FakeMailbox, FakeMailServer, RemoteMessageRecord } from './fake-mail-server';

export interface KeywordMutation {
  readonly add: readonly string[];
  readonly remove: readonly string[];
}

export const writeFlags = (
  server: FakeMailServer,
  path: string,
  uids: readonly number[],
  mutation: FlagMutation,
): Promise<void> => {
  if (server.failFlagWrites !== null) {
    return Promise.reject(new Error(server.failFlagWrites));
  }
  const flags: Partial<MessageFlags> = {};
  mutation.add.forEach((flag) => (flags[flag] = true));
  mutation.remove.forEach((flag) => (flags[flag] = false));
  uids.forEach((uid) => server.updateFlags(path, uid, flags));
  return Promise.resolve();
};

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
    if (record === undefined) {
      return;
    }
    const next = [...new Set([...(record.labels ?? []), ...mutation.add])].filter(
      (label) => !mutation.remove.includes(label),
    );
    server.updateLabels(mailbox.path, uid, next);
    relabelMemberships(server, stateOfRecord(server, record), mutation);
  });
  return Promise.resolve();
};

const copyRecord = (
  server: FakeMailServer,
  source: FakeMailbox,
  targetPath: string,
  record: RemoteMessageRecord | undefined,
): number | null => {
  if (record === undefined) {
    return null;
  }
  if (server.gmail) {
    return moveGmailRecord(server, source, server.mailbox(targetPath), record);
  }
  const uid = server.tryDeliver(targetPath, record.source, record);
  if (uid !== null && !server.partialMoves) {
    server.expunge(source.path, record.uid);
  }
  return uid;
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
    const newUid = copyRecord(server, mailbox, targetPath, mailbox.messages.get(uid));
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
