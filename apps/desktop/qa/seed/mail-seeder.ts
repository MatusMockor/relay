import type { ImapFlow } from 'imapflow';
import { withImap } from '../greenmail/imap-session';
import type { MailUser } from '../greenmail/mail-user';
import { rawMessage } from './raw-message';
import type { SeedScenario } from './seed-message';

export type SeedProgress = (done: number, total: number) => void;

const ensureMailboxes = async (client: ImapFlow, wanted: readonly string[]): Promise<void> => {
  const existing = new Set((await client.list()).map((mailbox) => mailbox.path.toUpperCase()));
  for (const path of wanted) {
    if (existing.has(path.toUpperCase())) {
      continue;
    }
    await client.mailboxCreate(path);
  }
};

const appendAll = async (
  client: ImapFlow,
  scenario: SeedScenario,
  onProgress: SeedProgress,
): Promise<number> => {
  let done = 0;
  for (const message of scenario.messages()) {
    const flags = message.seen === true ? ['\\Seen'] : [];
    await client.append(message.mailbox, await rawMessage(message), flags, message.date);
    done += 1;
    if (done % 1_000 === 0 || done === scenario.total) {
      onProgress(done, scenario.total);
    }
  }
  return done;
};

export const seedMailbox = (
  user: MailUser,
  scenario: SeedScenario,
  onProgress: SeedProgress = () => undefined,
): Promise<number> =>
  withImap(user, async (client) => {
    await ensureMailboxes(client, scenario.mailboxes);
    return appendAll(client, scenario, onProgress);
  });
