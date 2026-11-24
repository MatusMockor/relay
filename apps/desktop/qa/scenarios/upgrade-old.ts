import { waitForInbox } from '../app/inbox';
import { GMAIL } from '../gmail/gmail-layout';
import { GMAIL_SMALL_SUBJECTS, gmailSmallMessageId } from '../gmail/gmail-small-inbox';
import { exactly, expectServer } from './gmail-expect';
import { addGmailAccount } from './gmail-onboard';
import type { GmailScenarioContext } from './gmail-scenario';
import { SMALL_INBOX_THREADS, waitForFullSync } from './gmail-small-sync';
import { takeSnapshot, type UpgradeSnapshot } from './upgrade-snapshot';

export const runOldPhase = async (context: GmailScenarioContext): Promise<UpgradeSnapshot> => {
  const started = Date.now();
  await addGmailAccount(context);
  await waitForInbox(context.page, SMALL_INBOX_THREADS.length);
  await waitForFullSync(context);
  context.step(`old app synced the Gmail emulator in ${String(Date.now() - started)} ms`);
  await expectServer(
    context,
    gmailSmallMessageId(GMAIL_SMALL_SUBJECTS.hosting),
    'seeding',
    exactly(GMAIL.inbox, GMAIL.allMail),
  );
  return takeSnapshot(context, 'old');
};
