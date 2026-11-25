import type { Message, MessageId } from '@relay/shared/domain';
import { PETER } from './compose-setup';
import { deliverMail, type MailSpec, ME, present } from './fixtures';
import { seedGmailAccount } from './gmail-move-setup';
import { mailboxAt } from './legacy-duplicates';
import { type TestEngine, USER_ID } from './test-engine';

export interface LegacySentIds {
  readonly sentEmailId: string | null;
  readonly allMailEmailId: string | null;
}

const OUTGOING: MailSpec = {
  id: 'out-1',
  subject: 'Ponuka',
  from: ME,
  to: [PETER],
  emailId: 'gm-out',
  allMail: false,
  date: '2026-11-14T08:00:00.000Z',
};

const onlyStored = (engine: TestEngine): Message => {
  const [message, ...others] = [...engine.db.tables.messages.values()];
  return present(others.length === 0 ? message : undefined);
};

const setEmailId = (engine: TestEngine, id: MessageId, emailId: string | null): void => {
  const message = present(engine.db.tables.messages.get(id));
  engine.db.tables.messages.set(id, { ...message, emailId });
};

export const seedLegacySent = async (engine: TestEngine, ids: LegacySentIds) => {
  const { account, server } = await seedGmailAccount(engine);
  deliverMail(server, 'Sent', OUTGOING);
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const sent = onlyStored(engine);
  const allMail = await mailboxAt(engine, account, 'Archive');
  const uid = deliverMail(server, 'Archive', {
    ...OUTGOING,
    emailId: ids.allMailEmailId ?? OUTGOING.emailId,
  });
  const location = { mailboxId: allMail.id, uid };
  const headers = engine.db.tables.messageHeaders.get(sent.id) ?? new Map<string, string[]>();
  const archived = await engine.repositories.messages.upsert(
    {
      ...sent,
      id: 'msg_legacy_all_mail' as MessageId,
      emailId: ids.allMailEmailId,
      ...location,
      placements: [location],
    },
    headers,
  );
  await engine.services.sync.syncAccount(USER_ID, account.id);
  setEmailId(engine, sent.id, ids.sentEmailId);
  setEmailId(engine, archived.id, ids.allMailEmailId);
  return { account, server, sent, archived, allMail };
};
