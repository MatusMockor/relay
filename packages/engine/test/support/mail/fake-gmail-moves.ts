import type { FakeMailbox, FakeMailServer, RemoteMessageRecord } from './fake-mail-server';
import {
  addMembership,
  dropMembership,
  ensureAllMail,
  type GmailMessageState,
  membershipsOf,
  removesEveryLabel,
  stateOfRecord,
  touchMemberships,
} from './fake-gmail-messages';
import type { KeywordMutation } from './fake-writes';

const labelFor = (
  server: FakeMailServer,
  state: GmailMessageState,
  mailbox: FakeMailbox,
  held: boolean,
): void => {
  if (mailbox.role !== 'label' || state.labels.includes(mailbox.path) === held) {
    return;
  }
  const others = state.labels.filter((label) => label !== mailbox.path);
  state.labels = held ? [...others, mailbox.path] : others;
  touchMemberships(server, state.emailId);
};

const leave = (server: FakeMailServer, state: GmailMessageState, mailbox: FakeMailbox) => {
  dropMembership(server, mailbox, state.emailId);
  labelFor(server, state, mailbox, false);
};

const dropOthers = (server: FakeMailServer, state: GmailMessageState, kept: FakeMailbox) => {
  membershipsOf(server, state.emailId)
    .filter(({ mailbox }) => mailbox !== kept)
    .forEach(({ mailbox }) => {
      leave(server, state, mailbox);
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
    leave(server, state, source);
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
  labelFor(server, state, target, true);
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
