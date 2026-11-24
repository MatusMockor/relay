import type { FakeMailbox, FakeMailServer, RemoteMessageRecord } from './fake-mail-server';
import {
  addMembership,
  dropMembership,
  ensureAllMail,
  type GmailMessageState,
  membershipsOf,
  removesEveryLabel,
  stateOfRecord,
} from './fake-gmail-messages';
import type { KeywordMutation } from './fake-writes';

const dropOthers = (server: FakeMailServer, state: GmailMessageState, kept: FakeMailbox) => {
  membershipsOf(server, state.emailId)
    .filter(({ mailbox }) => mailbox !== kept)
    .forEach(({ mailbox }) => {
      dropMembership(server, mailbox, state.emailId);
    });
};

const settleMove = (
  server: FakeMailServer,
  source: FakeMailbox,
  target: FakeMailbox,
  state: GmailMessageState,
): void => {
  if (removesEveryLabel(target.role)) {
    dropOthers(server, state, target);
    return;
  }
  if (source.role !== 'archive') {
    dropMembership(server, source, state.emailId);
  }
  ensureAllMail(server, state);
};

export const moveGmailRecord = (
  server: FakeMailServer,
  source: FakeMailbox,
  target: FakeMailbox,
  record: RemoteMessageRecord,
): number => {
  const state = stateOfRecord(server, record);
  const uid = addMembership(server, target, state);
  if (!server.partialMoves) {
    settleMove(server, source, target, state);
  }
  return uid;
};

const labelMailbox = (server: FakeMailServer, label: string): FakeMailbox | null => {
  const mailbox = server.find(label);
  return mailbox?.role === 'label' ? mailbox : null;
};

export const relabelMemberships = (
  server: FakeMailServer,
  state: GmailMessageState,
  mutation: KeywordMutation,
): void => {
  mutation.add.forEach((label) => {
    const mailbox = labelMailbox(server, label);
    if (mailbox !== null) {
      addMembership(server, mailbox, state);
    }
  });
  mutation.remove.forEach((label) => {
    const mailbox = labelMailbox(server, label);
    if (mailbox !== null) {
      dropMembership(server, mailbox, state.emailId);
    }
  });
};
