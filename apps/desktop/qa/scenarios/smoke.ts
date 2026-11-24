import { openThread } from '../app/thread-view';
import { continueWithoutAccount } from '../app/onboarding';
import { addImapAccount, fillImapAccount, imapAccountOf } from '../app/imap-account';
import { waitForInbox, waitForThreadRow } from '../app/inbox';
import { smallInbox, SMALL_INBOX_THREADS } from '../seed/small-inbox';
import { runScenario } from './scenario-context';

const OPENED = 'Zmluva s dodávateľom - pripomienky';
const NEWEST = SMALL_INBOX_THREADS.at(-1)?.subject ?? '';

await runScenario({
  name: 'smoke',
  seed: (user) => smallInbox(user.email),
  run: async ({ page, user, screenshot, step }) => {
    await screenshot('welcome');
    await continueWithoutAccount(page);
    const account = imapAccountOf(user);
    await fillImapAccount(page, account);
    await screenshot('account-form');
    step('adding the account');
    await addImapAccount(page, account);
    await waitForInbox(page, SMALL_INBOX_THREADS.length);
    await waitForThreadRow(page, NEWEST);
    await screenshot('inbox');
    await openThread(page, OPENED);
    await screenshot('thread');
  },
});
