import { type Message, placementIn } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { MessageLocator } from '../../src/services/actions/handlers/message-locator';
import { rolesAfter } from '../../src/services/actions/handlers/physical-messages';
import { settledState } from '../../src/services/actions/handlers/state-move-plan';
import { MailCopies } from '../../src/services/shared/mail-copies';
import { deliverMail, type MailSpec, present } from '../support/fixtures';
import { gmailMoveThread } from '../support/gmail-move-setup';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { gmailJoinedMessage } from '../support/placements';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const SPEC: MailSpec = { id: 'g1', emailId: 'gm-1', date: '2026-11-14T08:00:00.000Z' };

type Setup = Awaited<ReturnType<typeof gmailMoveThread>>;

const stateAfterSpamToArchive = async (engine: TestEngine, setup: Setup, message: Message) => {
  const spam = present(await engine.repositories.mailboxes.findByPath(setup.account.id, 'Spam'));
  const context = { userId: USER_ID, thread: setup.thread, account: setup.account };
  const locator = new MessageLocator(
    engine.repositories.mailboxes,
    engine.repositories.pendingWork,
  );
  const located = await locator.locate({ ...context, messages: [message] });
  const source = present(placementIn(message, spam.id));
  const moves = [{ messageId: message.id, source, role: 'archive' as const }];
  return settledState(rolesAfter(MailCopies.of(setup.account), located, moves));
};

describe('roles after a planned move', () => {
  it('keeps the unmoved inbox placement when a spam placement moves to All Mail', async () => {
    const engine = createTestEngine();
    const setup = await gmailJoinedMessage(engine, (server: FakeMailServer) => {
      deliverMail(server, 'INBOX', { ...SPEC, allMail: false });
      deliverMail(server, 'Spam', SPEC);
    });
    expect(setup.message.placements).toHaveLength(2);

    expect(await stateAfterSpamToArchive(engine, setup, setup.message)).toBe('inbox');
  });

  it('settles as done when the only spam placement moves to All Mail', async () => {
    const engine = createTestEngine();
    const setup = await gmailMoveThread(engine, (server) => {
      deliverMail(server, 'Spam', SPEC);
    });
    const [message, ...others] = await engine.repositories.messages.listByThread(
      USER_ID,
      setup.thread.id,
    );
    expect(others).toEqual([]);

    expect(await stateAfterSpamToArchive(engine, setup, present(message))).toBe('done');
  });
});
