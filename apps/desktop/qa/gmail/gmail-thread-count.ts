import { threadsWith } from '../seed/thread-count';
import { GMAIL } from './gmail-layout';
import type { GmailSeed } from './gmail-seed';

function* inboxFlagged(seed: GmailSeed) {
  for (const placed of seed.messages()) {
    yield { ...placed.message, mailbox: placed.folders.includes(GMAIL.inbox) ? GMAIL.inbox : '' };
  }
}

export const gmailInboxThreads = (seed: GmailSeed): number =>
  threadsWith(inboxFlagged(seed), (message) => message.mailbox === GMAIL.inbox);
