import assert from 'node:assert/strict';
import type { Message } from 'imapkit';
import { rawMessage } from '../seed/raw-message';
import type { SeedProgress } from '../seed/mail-seeder';
import { GMAIL, labelOfFolder } from './gmail-layout';
import { msgidOf } from './gmail-message';
import type { GmailSeed, GmailSeedMessage } from './gmail-seed';
import type { GmailServer } from './gmail-server';

const addCopy = (
  gmail: GmailServer,
  path: string,
  raw: Buffer,
  seed: GmailSeedMessage,
): Message => {
  gmail.server.control.addMessage(path, {
    raw,
    flags: seed.message.seen === true ? ['\\Seen'] : [],
    internaldate: seed.message.date,
  });
  const messages = gmail.server.getMailbox(path)?.messages ?? [];
  const added = messages[messages.length - 1];
  assert.ok(added, `imapkit did not store the message in ${path}`);
  return added;
};

const deliverOne = (
  gmail: GmailServer,
  seed: GmailSeedMessage,
  raw: Buffer,
  threads: Map<string, string>,
): void => {
  const primary = addCopy(gmail, GMAIL.allMail, raw, seed);
  const msgid = msgidOf(primary);
  const parent =
    seed.message.inReplyTo === undefined ? undefined : threads.get(seed.message.inReplyTo);
  const thrid = parent ?? msgid;
  threads.set(seed.message.messageId, thrid);
  const labels = seed.folders.map(labelOfFolder).sort();
  [primary, ...seed.folders.map((folder) => addCopy(gmail, folder, raw, seed))].forEach((copy) => {
    copy['X-GM-MSGID'] = msgid;
    copy['X-GM-THRID'] = thrid;
    copy['X-GM-LABELS'] = labels;
  });
};

export const deliverGmail = async (
  gmail: GmailServer,
  seed: GmailSeed,
  onProgress: SeedProgress = () => undefined,
): Promise<number> => {
  const threads = new Map<string, string>();
  let done = 0;
  for (const message of seed.messages()) {
    const raw = await rawMessage(message.message);
    gmail.mirror.quietly(() => {
      deliverOne(gmail, message, raw, threads);
    });
    done += 1;
    if (done % 10_000 === 0 || done === seed.total) {
      onProgress(done, seed.total);
    }
  }
  return done;
};
