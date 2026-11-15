import type { DraftContent } from '@relay/shared/domain';
import { deliverMail, present, seedAccount } from './fixtures';
import { type TestEngine, USER_ID } from './test-engine';

export const PETER = { name: 'Peter Kral', email: 'peter@partner.test' };

export const setupReply = async (engine: TestEngine) => {
  const seeded = await seedAccount(engine);
  deliverMail(seeded.server, 'INBOX', { id: 'm1', subject: 'Offer' });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const thread = present(
    (await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 })).items[0],
  );
  const [message] = await engine.repositories.messages.listByThread(USER_ID, thread.id);
  const reply: DraftContent = {
    accountId: seeded.account.id,
    to: [PETER],
    cc: [],
    bcc: [],
    subject: 'Re: Offer',
    body: 'Sounds good',
    inReplyToThreadId: thread.id,
    inReplyToMessageId: present(message).id,
    attachments: [],
  };
  engine.events.clear();
  return { ...seeded, thread, reply };
};
