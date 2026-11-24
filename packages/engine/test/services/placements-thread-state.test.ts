import { type AccountId, type MailboxRole, placementIn } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { MessageLocator } from '../../src/services/actions/handlers/message-locator';
import { receivedIn } from '../../src/services/actions/handlers/physical-messages';
import { MailCopies } from '../../src/services/shared/mail-copies';
import { PendingMoves } from '../../src/services/shared/pending-moves';
import { legacyMoveRef, recordProviderOps } from '../../src/services/shared/provider-ops';
import { placementRolesOf, syncedThreadState } from '../../src/services/sync/synced-thread-state';
import { emptyThreadWork } from '../../src/services/sync/thread-refresh-work';
import { deliverMail, type MailSpec, ME, present } from '../support/fixtures';
import { gmailInboxAndAllMail, gmailJoinedMessage } from '../support/placements';
import { createTestEngine, TEST_NOW, type TestEngine, USER_ID } from '../support/test-engine';

const PETER = { name: 'Peter Kral', email: 'peter@partner.test' };

const SENT_SPEC: MailSpec = { id: 's1', emailId: 'gm-s1', from: ME, to: [PETER] };

const inboxSentAndAllMail = (engine: TestEngine, spec: MailSpec) =>
  gmailJoinedMessage(engine, (server) => {
    deliverMail(server, 'INBOX', spec);
    deliverMail(server, 'Archive', spec);
    deliverMail(server, 'Sent', spec);
  });

const rolesFor = async (engine: TestEngine, accountId: AccountId) => {
  const mailboxes = await engine.repositories.mailboxes.listForSync(accountId);
  const roles = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.role]));
  return placementRolesOf(
    roles,
    await PendingMoves.load(engine.repositories.pendingWork, accountId),
  );
};

const roleNames = (copies: readonly { readonly role: MailboxRole | undefined }[]) =>
  copies.map(({ role }) => role);

describe('placement thread state', () => {
  it('keeps the thread in the inbox when an inbox placement arrives', async () => {
    const engine = createTestEngine();
    const { account, thread, message } = await gmailInboxAndAllMail(engine);
    const rolesOf = await rolesFor(engine, account.id);

    const state = syncedThreadState(
      { ...emptyThreadWork(thread.id), arrivedIn: ['inbox'] },
      null,
      [message],
      rolesOf,
      MailCopies.of(account),
    );

    expect(message.placements).toHaveLength(2);
    expect(roleNames(rolesOf(message))).toEqual(['inbox', 'archive']);
    expect(state).toBe('inbox');
  });

  it('files the All Mail placement of a sent message as sent, per placement', async () => {
    const engine = createTestEngine();
    const { account, thread, message } = await inboxSentAndAllMail(engine, SENT_SPEC);
    const rolesOf = await rolesFor(engine, account.id);
    const copies = MailCopies.of(account);

    expect(roleNames(rolesOf(message))).toEqual(['inbox', 'archive', 'sent']);
    expect(copies.filedRoles(rolesOf(message))).toEqual(['inbox', 'sent', 'sent']);
    expect(syncedThreadState(emptyThreadWork(thread.id), null, [message], rolesOf, copies)).toBe(
      'done',
    );
  });

  it('keeps the All Mail placement archived when the message is addressed to self', async () => {
    const engine = createTestEngine();
    const { account, message } = await inboxSentAndAllMail(engine, { ...SENT_SPEC, to: [ME] });
    const rolesOf = await rolesFor(engine, account.id);

    expect(MailCopies.of(account).filedRoles(rolesOf(message))).toEqual([
      'inbox',
      'archive',
      'sent',
    ]);
  });

  it('applies a sourced pending move only to the placement it names', async () => {
    const engine = createTestEngine();
    const { account, thread, message, inbox } = await gmailInboxAndAllMail(engine);
    const source = present(placementIn(message, inbox.id));
    await recordProviderOps(
      engine.repositories.pendingWork,
      account.id,
      [{ messageId: message.id, change: { kind: 'move', role: 'trash' }, source }],
      TEST_NOW,
    );
    const rolesOf = await rolesFor(engine, account.id);

    const state = syncedThreadState(
      emptyThreadWork(thread.id),
      null,
      [message],
      rolesOf,
      MailCopies.of(account),
    );

    expect(roleNames(rolesOf(message))).toEqual(['trash', 'archive']);
    expect(state).toBe('done');
  });

  it('applies a legacy source-less pending move to the primary placement only', async () => {
    const engine = createTestEngine();
    const { account, message } = await gmailInboxAndAllMail(engine);
    await engine.repositories.pendingWork.put({
      accountId: account.id,
      kind: 'provider-op',
      ref: legacyMoveRef(message.id),
      payload: { messageId: message.id, change: { kind: 'move', role: 'trash' } },
      createdAt: TEST_NOW,
    });

    expect(roleNames((await rolesFor(engine, account.id))(message))).toEqual(['trash', 'archive']);
  });

  it('locates one entry per placement and keeps the inbox placement received', async () => {
    const engine = createTestEngine();
    const { account, thread, message } = await inboxSentAndAllMail(engine, SENT_SPEC);
    const locator = new MessageLocator(
      engine.repositories.mailboxes,
      engine.repositories.pendingWork,
    );
    const copies = MailCopies.of(account);

    const located = await locator.locate({ userId: USER_ID, thread, account, messages: [message] });

    expect(located.map(({ role, moving }) => [role, moving])).toEqual([
      ['inbox', false],
      ['archive', false],
      ['sent', false],
    ]);
    expect(located.map(({ placement }) => placement.mailboxId)).toEqual(
      located.map(({ mailboxId }) => mailboxId),
    );
    expect(receivedIn(copies, located, ['inbox', 'archive']).map(({ role }) => role)).toEqual([
      'inbox',
    ]);
  });
});
