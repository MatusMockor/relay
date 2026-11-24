import {
  type MailboxRoleOf,
  type Message,
  type MessagePlacement,
  placementRank,
  primaryPlacement,
} from '@relay/shared/domain';
import { expect } from 'vitest';
import { type MailSpec, present } from './fixtures';
import { GMAIL_FIRST, gmailMoveThread, inboxAndAllMail } from './gmail-move-setup';
import type { FakeMailServer } from './mail/fake-mail-server';
import { type TestEngine, USER_ID } from './test-engine';

const roleOfIn =
  (engine: TestEngine): MailboxRoleOf =>
  (mailboxId) =>
    engine.db.tables.mailboxes.get(mailboxId)?.role;

const unionOf = (messages: readonly Message[]): MessagePlacement[] => {
  const byMailbox = new Map<string, MessagePlacement>();
  for (const placement of messages.flatMap((message) => message.placements)) {
    byMailbox.set(placement.mailboxId, byMailbox.get(placement.mailboxId) ?? placement);
  }
  return [...byMailbox.values()];
};

export const joinPlacements = (
  engine: TestEngine,
  keeper: Message,
  others: readonly Message[],
): Message => {
  const { tables } = engine.db;
  const placements = unionOf([keeper, ...others]);
  const primary = primaryPlacement({ ...keeper, placements }, roleOfIn(engine));
  const joined: Message = { ...keeper, mailboxId: primary.mailboxId, uid: primary.uid, placements };
  tables.messages.set(keeper.id, joined);
  for (const other of others) {
    tables.messages.delete(other.id);
    tables.messageHeaders.delete(other.id);
    tables.messageAliases.set(other.id, keeper.id);
  }
  return joined;
};

export const gmailJoinedMessage = async (
  engine: TestEngine,
  deliver: (server: FakeMailServer) => void,
) => {
  const setup = await gmailMoveThread(engine, deliver);
  const roleOf = roleOfIn(engine);
  const rank = (message: Message) => placementRank(primaryPlacement(message, roleOf), roleOf);
  const messages = await engine.repositories.messages.listByThread(USER_ID, setup.thread.id);
  expect(messages.length).toBeGreaterThan(1);
  const [keeper, ...others] = [...messages].sort((a, b) => rank(a) - rank(b));
  return { ...setup, message: joinPlacements(engine, present(keeper), others) };
};

export const gmailInboxAndAllMail = async (engine: TestEngine, spec: MailSpec = GMAIL_FIRST) => {
  const joined = await gmailJoinedMessage(engine, (server) => {
    inboxAndAllMail(server, spec);
  });
  const { mailboxes } = engine.repositories;
  const inbox = present(await mailboxes.findByPath(joined.account.id, 'INBOX'));
  const allMail = present(await mailboxes.findByPath(joined.account.id, 'Archive'));
  return { ...joined, inbox, allMail };
};
