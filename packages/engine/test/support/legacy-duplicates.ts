import type { MailAccount, Mailbox, Message, MessageId } from '@relay/shared/domain';
import { deliverMail, type MailSpec, messageHeader, present } from './fixtures';
import { seedGmailAccount } from './gmail-move-setup';
import type { FakeMailServer } from './mail/fake-mail-server';
import { type TestEngine, USER_ID } from './test-engine';

export interface LegacySpec extends MailSpec {
  readonly unresolved?: boolean;
}

export interface LegacyPair {
  readonly keeperId: MessageId;
  readonly loserId: MessageId;
  readonly allMailUid: number;
}

export interface LegacyDuplicates {
  readonly account: MailAccount;
  readonly server: FakeMailServer;
  readonly inbox: Mailbox;
  readonly allMail: Mailbox;
  readonly pairs: readonly LegacyPair[];
}

export const legacyIdOf = (spec: MailSpec): MessageId => `msg_legacy_${spec.id}` as MessageId;

export const mailboxAt = async (
  engine: TestEngine,
  account: MailAccount,
  path: string,
): Promise<Mailbox> => present(await engine.repositories.mailboxes.findByPath(account.id, path));

const storedByHeader = (engine: TestEngine, spec: MailSpec): Message =>
  present(
    [...engine.db.tables.messages.values()].find(
      (message) => message.messageIdHeader === messageHeader(spec.id),
    ),
  );

const forgetEmailIds = (engine: TestEngine, ids: readonly MessageId[]): void => {
  ids.forEach((id) => {
    const message = present(engine.db.tables.messages.get(id));
    engine.db.tables.messages.set(id, { ...message, emailId: null });
  });
};

const legacyCopy = async (
  engine: TestEngine,
  server: FakeMailServer,
  allMail: Mailbox,
  spec: LegacySpec,
): Promise<LegacyPair> => {
  const keeper = storedByHeader(engine, spec);
  const allMailUid = deliverMail(server, allMail.path, spec);
  const location = { mailboxId: allMail.id, uid: allMailUid };
  const headers = engine.db.tables.messageHeaders.get(keeper.id) ?? new Map<string, string[]>();
  const loser = await engine.repositories.messages.upsert(
    { ...keeper, id: legacyIdOf(spec), ...location, placements: [location] },
    headers,
  );
  return { keeperId: keeper.id, loserId: loser.id, allMailUid };
};

export const seedLegacyDuplicates = async (
  engine: TestEngine,
  specs: readonly LegacySpec[],
): Promise<LegacyDuplicates> => {
  const { account, server } = await seedGmailAccount(engine);
  specs.forEach((spec) => deliverMail(server, 'INBOX', { ...spec, allMail: false }));
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const inbox = await mailboxAt(engine, account, 'INBOX');
  const allMail = await mailboxAt(engine, account, 'Archive');
  const pairs: LegacyPair[] = [];
  for (const spec of specs) {
    pairs.push(await legacyCopy(engine, server, allMail, spec));
  }
  await engine.services.sync.syncAccount(USER_ID, account.id);
  specs.forEach((spec, index) => {
    const pair = present(pairs[index]);
    if (spec.unresolved === true) {
      forgetEmailIds(engine, [pair.keeperId, pair.loserId]);
    }
  });
  return { account, server, inbox, allMail, pairs };
};
