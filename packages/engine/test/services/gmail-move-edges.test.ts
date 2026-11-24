import { describe, expect, it } from 'vitest';
import { deliverMail, present } from '../support/fixtures';
import {
  GMAIL_FIRST,
  gmailMoveThread,
  inboxAndAllMail,
  providerOps,
} from '../support/gmail-move-setup';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const storedThread = (engine: TestEngine) => present([...engine.db.tables.threads.values()][0]);

describe('Gmail move edge cases', () => {
  it('drops the queued label add when an offline move is undone', async () => {
    const engine = createTestEngine();
    const { account, server, target, label, act } = await gmailMoveThread(engine, inboxAndAllMail);
    server.failConnect = 'offline';
    await act({ type: 'move', mailboxId: target.id });
    expect(providerOps(engine)).toHaveLength(2);
    server.failConnect = null;

    await act({ type: 'undoMove' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(providerOps(engine)).toEqual([]);
    expect(server.labelWrites.filter(({ add }) => add.includes('Klienti'))).toEqual([]);
    expect(server.record('Archive', 1).labels).not.toContain('Klienti');
    expect(storedThread(engine).labelIds).not.toContain(label.id);
    expect(storedThread(engine).state).toBe('inbox');
  });

  it('keeps a label that the All Mail copy already had when the move is undone', async () => {
    const engine = createTestEngine();
    const { server, target, label, act } = await gmailMoveThread(engine, (gmail) => {
      inboxAndAllMail(gmail, { ...GMAIL_FIRST, labels: ['\\Inbox', 'Klienti'] });
    });

    await act({ type: 'move', mailboxId: target.id });
    const undone = await act({ type: 'undoMove' });

    expect(server.labelWrites).toEqual([]);
    expect(undone.labelIds).toEqual([label.id]);
  });

  it('archives every Gmail message of a shared Message-ID, keyed by email id', async () => {
    const engine = createTestEngine();
    const { server, target, act } = await gmailMoveThread(engine, (gmail) => {
      deliverMail(gmail, 'INBOX', GMAIL_FIRST);
      deliverMail(gmail, 'INBOX', { ...GMAIL_FIRST, emailId: 'gm-3' });
    });

    const moved = await act({ type: 'move', mailboxId: target.id });

    expect(moved.state).toBe('done');
    expect(server.mailbox('INBOX').messages.size).toBe(0);
    expect(server.labelWrites.flatMap(({ uids }) => uids)).toHaveLength(2);
  });

  it('settles an undone move per email id when two messages share a Message-ID', async () => {
    const engine = createTestEngine();
    const { server, target, act } = await gmailMoveThread(engine, (gmail) => {
      deliverMail(gmail, 'Spam', GMAIL_FIRST);
      deliverMail(gmail, 'INBOX', { ...GMAIL_FIRST, emailId: 'gm-3', body: 'Iná kópia' });
    });
    await act({ type: 'move', mailboxId: target.id });

    const undone = await act({ type: 'undoMove' });

    expect(undone.state).toBe('inbox');
    expect(server.mailbox('Spam').messages.size).toBe(1);
    expect(server.mailbox('INBOX').messages.size).toBe(1);
  });

  it('keeps a reply draft on the message when archiving drops its INBOX placement', async () => {
    const engine = createTestEngine();
    const { account, thread, act } = await gmailMoveThread(engine, inboxAndAllMail);
    const inbox = present(await engine.repositories.mailboxes.findByRole(account.id, 'inbox'));
    const rows = await engine.repositories.messages.listByThread(USER_ID, thread.id);
    const inboxRow = present(rows.find((row) => row.mailboxId === inbox.id));
    const draft = await engine.services.compose.createDraft(USER_ID, {
      accountId: account.id,
      to: [{ name: 'Peter Kral', email: 'peter@partner.test' }],
      cc: [],
      bcc: [],
      subject: 'Re: Subject g1',
      body: 'Ďakujem',
      inReplyToThreadId: thread.id,
      inReplyToMessageId: inboxRow.id,
      attachments: [],
    });

    await act({ type: 'done' });

    const [survivor] = await engine.repositories.messages.listByThread(USER_ID, thread.id);
    const kept = await engine.services.compose.getDraft(USER_ID, draft.id);
    expect(kept.inReplyToMessageId).toBe(present(survivor).id);
    const saved = await engine.services.compose.updateDraft(USER_ID, draft.id, {
      body: 'Ďakujem, posielam podklady',
      inReplyToMessageId: inboxRow.id,
    });
    expect(saved.inReplyToMessageId).toBe(present(survivor).id);
    const sent = await engine.services.compose.send(USER_ID, {
      source: 'draft',
      draftId: draft.id,
    });
    expect(sent.status).toBe('sent');
  });
});
