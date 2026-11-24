import { describe, expect, it } from 'vitest';
import { deliverMail, standardServer } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { moveRecords, writeLabels } from '../support/mail/fake-writes';

const gmailServer = (): FakeMailServer => {
  const server = standardServer({ gmail: true });
  server.addMailbox('Spam', 'spam');
  server.addMailbox('Klienti', 'label');
  return server;
};

const uidsOf = (server: FakeMailServer, path: string): number[] => [
  ...server.mailbox(path).messages.keys(),
];

const move = (server: FakeMailServer, from: string, uid: number, to: string) =>
  moveRecords(server.mailbox(from), server, [uid], to);

describe('fake Gmail server', () => {
  it('delivers one message to INBOX and All Mail with an email id from its Message-ID', () => {
    const server = gmailServer();

    const inboxUid = deliverMail(server, 'INBOX', { id: 'g1' });
    const allMailUid = deliverMail(server, 'Archive', { id: 'g1' });

    expect(uidsOf(server, 'INBOX')).toEqual([inboxUid]);
    expect(uidsOf(server, 'Archive')).toEqual([allMailUid]);
    expect(server.record('INBOX', inboxUid).emailId).toBe('gm-g1@mail.test');
    expect(server.record('Archive', allMailUid).emailId).toBe('gm-g1@mail.test');
    expect(server.gmailMessages.size).toBe(1);
  });

  it('shares flags and labels across memberships and reports a change in every mailbox', () => {
    const server = gmailServer();
    const uid = deliverMail(server, 'INBOX', { id: 'g1' });
    const before = {
      inbox: server.mailbox('INBOX').highestModseq,
      allMail: server.mailbox('Archive').highestModseq,
    };

    server.updateFlags('INBOX', uid, { seen: true });
    server.updateLabels('INBOX', uid, ['\\Inbox', 'Klienti']);

    const allMail = server.record('Archive', 1);
    expect(allMail.flags.seen).toBe(true);
    expect(allMail.labels).toEqual(['\\Inbox', 'Klienti']);
    expect(server.mailbox('INBOX').highestModseq).toBeGreaterThan(before.inbox);
    expect(server.mailbox('Archive').highestModseq).toBeGreaterThan(before.allMail);
    expect(allMail.modseq).toBe(server.mailbox('Archive').highestModseq);
  });

  it('archives by dropping INBOX and reports the existing All Mail UID', async () => {
    const server = gmailServer();
    deliverMail(server, 'Archive', { id: 'other' });
    const uid = deliverMail(server, 'INBOX', { id: 'g1' });

    const moved = await move(server, 'INBOX', uid, 'Archive');

    expect(moved.uidMap).toEqual(new Map([[uid, 2]]));
    expect(uidsOf(server, 'INBOX')).toEqual([]);
    expect(uidsOf(server, 'Archive')).toEqual([1, 2]);
  });

  it('moves All Mail back to INBOX while keeping the All Mail membership', async () => {
    const server = gmailServer();
    deliverMail(server, 'Archive', { id: 'g1' });

    const moved = await move(server, 'Archive', 1, 'INBOX');

    expect(moved.uidMap).toEqual(new Map([[1, 1]]));
    expect(uidsOf(server, 'INBOX')).toEqual([1]);
    expect(uidsOf(server, 'Archive')).toEqual([1]);
  });

  it('removes every label on trash and returns with a new All Mail UID on restore', async () => {
    const server = gmailServer();
    deliverMail(server, 'Sent', { id: 'g1' });
    const uid = deliverMail(server, 'INBOX', { id: 'g1' });
    deliverMail(server, 'Klienti', { id: 'g1' });

    const trashed = await move(server, 'INBOX', uid, 'Trash');

    expect(trashed.uidMap).toEqual(new Map([[uid, 1]]));
    expect(['INBOX', 'Archive', 'Sent', 'Klienti'].map((path) => uidsOf(server, path))).toEqual([
      [],
      [],
      [],
      [],
    ]);
    const restored = await move(server, 'Trash', 1, 'INBOX');
    expect(restored.uidMap).toEqual(new Map([[1, 2]]));
    expect(uidsOf(server, 'Trash')).toEqual([]);
    expect(uidsOf(server, 'Archive')).toEqual([2]);
    expect(server.gmailMessages.size).toBe(1);
  });

  it('adds and removes label mailbox memberships with X-GM-LABELS writes', async () => {
    const server = gmailServer();
    deliverMail(server, 'INBOX', { id: 'g1' });
    const allMail = server.mailbox('Archive');

    await writeLabels(allMail, server, [1], { add: ['Klienti'], remove: [] });
    expect(uidsOf(server, 'Klienti')).toEqual([1]);
    expect(server.record('INBOX', 1).labels).toEqual(['Klienti']);

    await writeLabels(allMail, server, [1], { add: [], remove: ['Klienti'] });
    expect(uidsOf(server, 'Klienti')).toEqual([]);
    expect(server.record('INBOX', 1).labels).toEqual([]);
  });

  it('forgets a message with its last membership and keeps sharing after a UIDVALIDITY reset', () => {
    const server = gmailServer();
    deliverMail(server, 'Archive', { id: 'old' });
    deliverMail(server, 'INBOX', { id: 'g1' });
    server.expunge('Archive', 1);

    server.resetUidValidity('Archive');
    server.updateFlags('INBOX', 1, { flagged: true });

    expect(server.gmailMessages.size).toBe(1);
    expect(server.record('Archive', 1).flags.flagged).toBe(true);
    expect(server.record('Archive', 1).emailId).toBe('gm-g1@mail.test');
  });

  it('keeps generic IMAP copies independent', () => {
    const server = standardServer();
    deliverMail(server, 'INBOX', { id: 'm1' });
    deliverMail(server, 'Archive', { id: 'm1' });

    server.updateFlags('INBOX', 1, { seen: true });

    expect(server.record('INBOX', 1).emailId).toBeNull();
    expect(server.record('Archive', 1).flags.seen).toBe(false);
  });

  it('generates distinct email ids for mail without a Message-ID', () => {
    const server = gmailServer();
    const bare = (subject: string) => new TextEncoder().encode(`Subject: ${subject}\r\n\r\nText`);
    const first = server.deliver('Archive', bare('A'));
    const firstId = server.record('Archive', first).emailId;
    server.expunge('Archive', first);

    const second = server.deliver('Archive', bare('B'));

    expect(server.record('Archive', second).emailId).not.toBe(firstId);
  });

  it('keeps label names in step with label mailbox memberships on MOVE', async () => {
    const server = gmailServer();
    deliverMail(server, 'INBOX', { id: 'g1' });

    await move(server, 'INBOX', 1, 'Klienti');
    expect(server.record('Archive', 1).labels).toEqual(['Klienti']);
    await move(server, 'Klienti', 1, 'INBOX');
    expect(server.record('Archive', 1).labels).toEqual([]);

    server.partialMoves = true;
    await move(server, 'INBOX', 2, 'Klienti').catch(() => null);
    expect(uidsOf(server, 'INBOX')).toEqual([2]);
    expect(server.record('Archive', 1).labels).toEqual(['Klienti']);
  });
});
