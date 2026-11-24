import type { AttachmentId, Mailbox, Message, MessagePlacement } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present } from '../support/fixtures';
import { GMAIL_FIRST, inboxAndAllMail } from '../support/gmail-move-setup';
import { storedMessages } from '../support/history';
import { attachmentHeader } from '../support/mail/header-attachment-extractor';
import { gmailInboxAndAllMail, gmailJoinedMessage } from '../support/placements';
import { searchServer } from '../support/server-search';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const OK_BODY = { status: 'ok', textBody: 'Body of g1', htmlBody: null };

const ATTACHMENT_ID = 'att_contract' as AttachmentId;

const placementOf = (message: Message, mailbox: Mailbox): MessagePlacement =>
  present(message.placements.find((placement) => placement.mailboxId === mailbox.id));

const headerOnly = (engine: TestEngine, message: Message): void => {
  engine.db.tables.messages.set(message.id, {
    ...message,
    bodyState: 'remote',
    textBody: null,
    htmlBody: null,
  });
};

const withPendingInbox = (engine: TestEngine, message: Message, inbox: Mailbox): void => {
  const stored = present(engine.db.tables.messages.get(message.id));
  const placements = stored.placements.map((placement) =>
    placement.mailboxId === inbox.id ? { ...placement, uid: 0 } : placement,
  );
  engine.db.tables.messages.set(message.id, { ...stored, uid: 0, placements });
};

const joinedWithAttachment = async () => {
  const engine = createTestEngine({ receivedAttachments: true });
  const setup = await gmailInboxAndAllMail(engine, {
    ...GMAIL_FIRST,
    headers: { 'X-Test-Attachment-1': attachmentHeader('zmluva.pdf', 'application/pdf', 'PDF') },
  });
  engine.db.tables.messages.set(setup.message.id, {
    ...setup.message,
    attachments: [
      {
        id: ATTACHMENT_ID,
        filename: 'zmluva.pdf',
        contentType: 'application/pdf',
        size: 3,
        contentId: null,
        inline: false,
      },
    ],
  });
  return { engine, ...setup };
};

const joinedAtDistinctUids = (engine: TestEngine) =>
  gmailJoinedMessage(engine, (server) => {
    server.expunge('Archive', deliverMail(server, 'Archive', { id: 'filler' }));
    inboxAndAllMail(server);
  });

const attachmentText = async (engine: TestEngine): Promise<string> => {
  const content = await engine.services.attachments.content(USER_ID, ATTACHMENT_ID);
  return new TextDecoder().decode(content.content);
};

describe('placement readers', () => {
  it('reads the body of a header-only message from its primary placement first', async () => {
    const engine = createTestEngine();
    const { server, message, inbox } = await gmailInboxAndAllMail(engine);
    headerOnly(engine, message);
    server.fetchedMessages.length = 0;

    await expect(engine.services.bodies.get(USER_ID, message.id)).resolves.toEqual(OK_BODY);
    expect(server.fetchedMessages).toEqual([
      { path: 'INBOX', uid: placementOf(message, inbox).uid },
    ]);
  });

  it('falls back to the All Mail placement when the inbox UID is gone', async () => {
    const engine = createTestEngine();
    const { server, message, inbox, allMail } = await gmailInboxAndAllMail(engine);
    headerOnly(engine, message);
    server.expunge('INBOX', placementOf(message, inbox).uid);
    server.fetchedMessages.length = 0;

    await expect(engine.services.bodies.get(USER_ID, message.id)).resolves.toEqual(OK_BODY);
    expect(server.fetchedMessages).toEqual([
      { path: 'INBOX', uid: placementOf(message, inbox).uid },
      { path: 'Archive', uid: placementOf(message, allMail).uid },
    ]);
  });

  it('skips a pending primary placement and reads the body from All Mail', async () => {
    const engine = createTestEngine();
    const { server, message, inbox, allMail } = await gmailInboxAndAllMail(engine);
    headerOnly(engine, message);
    withPendingInbox(engine, message, inbox);
    server.fetchedMessages.length = 0;

    await expect(engine.services.bodies.get(USER_ID, message.id)).resolves.toEqual(OK_BODY);
    expect(server.fetchedMessages).toEqual([
      { path: 'Archive', uid: placementOf(message, allMail).uid },
    ]);
  });

  it('reads a received attachment from All Mail when the inbox UID is gone', async () => {
    const { engine, server, message, inbox, allMail } = await joinedWithAttachment();
    server.expunge('INBOX', placementOf(message, inbox).uid);
    server.fetchedMessages.length = 0;

    expect(await attachmentText(engine)).toBe('PDF');
    expect(server.fetchedMessages).toEqual([
      { path: 'INBOX', uid: placementOf(message, inbox).uid },
      { path: 'Archive', uid: placementOf(message, allMail).uid },
    ]);
  });

  it('reads a received attachment from All Mail when the inbox UIDVALIDITY was reset', async () => {
    const { engine, server, message, inbox, allMail } = await joinedWithAttachment();
    const inboxUid = placementOf(message, inbox).uid;
    server.expunge('INBOX', inboxUid);
    deliverMail(server, 'INBOX', { id: 'other' });
    server.resetUidValidity('INBOX');
    expect(server.record('INBOX', inboxUid).source).not.toEqual(
      server.record('Archive', placementOf(message, allMail).uid).source,
    );
    server.fetchedMessages.length = 0;

    expect(await attachmentText(engine)).toBe('PDF');
    expect(server.fetchedMessages).toEqual([
      { path: 'Archive', uid: placementOf(message, allMail).uid },
    ]);
  });

  it('reads a received attachment from All Mail when the inbox UID holds another message', async () => {
    const { engine, server, message, inbox, allMail } = await joinedWithAttachment();
    const inboxUid = placementOf(message, inbox).uid;
    const otherUid = deliverMail(server, 'INBOX', {
      id: 'other',
      headers: { 'X-Test-Attachment-1': attachmentHeader('zmluva.pdf', 'application/pdf', 'XXX') },
    });
    const box = server.mailbox('INBOX');
    box.messages.set(inboxUid, { ...server.record('INBOX', otherUid), uid: inboxUid });
    box.messages.delete(otherUid);
    server.fetchedMessages.length = 0;

    expect(await attachmentText(engine)).toBe('PDF');
    expect(server.fetchedMessages).toEqual([
      { path: 'INBOX', uid: inboxUid },
      { path: 'Archive', uid: placementOf(message, allMail).uid },
    ]);
  });

  it('reads a received attachment from All Mail when the inbox placement is pending', async () => {
    const { engine, server, message, inbox, allMail } = await joinedWithAttachment();
    withPendingInbox(engine, message, inbox);
    server.fetchedMessages.length = 0;

    expect(await attachmentText(engine)).toBe('PDF');
    expect(server.fetchedMessages).toEqual([
      { path: 'Archive', uid: placementOf(message, allMail).uid },
    ]);
  });

  it('resolves a server search hit by its All Mail UID to the logical message', async () => {
    const engine = createTestEngine();
    const { account, server, message } = await joinedAtDistinctUids(engine);
    const inbox = present(await engine.repositories.mailboxes.findByPath(account.id, 'INBOX'));
    expect(message.placements.map(({ uid }) => uid).sort()).toEqual([1, 2]);
    server.expunge('INBOX', placementOf(message, inbox).uid);
    const before = storedMessages(engine).map(({ id }) => id);

    const response = await searchServer(engine, 'Subject g1');

    expect(server.textSearches.map(({ path }) => path)).toEqual(['Archive']);
    expect(response.hits.map((hit) => hit.messageId)).toEqual([message.id]);
    expect(storedMessages(engine).map(({ id }) => id)).toEqual(before);
  });
});
