import { submitAccountForm, fillImapAccount, imapAccountOf } from '../app/imap-account';
import { waitForInbox } from '../app/inbox';
import { continueWithoutAccount } from '../app/onboarding';
import { openThreadAt } from '../app/thread-view';
import { captureAt } from '../capture/timed-capture';
import { readQaEnv } from '../config/qa-env';
import { largeAccount } from '../seed/large-account';
import { readyRows, threadsWith } from '../seed/thread-count';
import { runScenario } from './scenario-context';

const DEFAULT_COUNT = 5_000;
const AFTER_ADD_OFFSETS_MS: readonly number[] = [2_000, 5_000, 10_000, 30_000];

const count = readQaEnv().QA_COUNT ?? DEFAULT_COUNT;

await runScenario({
  name: 'large-account',
  seed: (user) => largeAccount(user.email, { count, archiveRatio: 0.1 }),
  run: async ({ page, user, seeded, shots, screenshot, step }) => {
    await continueWithoutAccount(page);
    await fillImapAccount(page, imapAccountOf(user));
    const submitted = Date.now();
    const timed = captureAt(shots, 'after-add', AFTER_ADD_OFFSETS_MS, submitted);
    await submitAccountForm(page);
    step(`account added after ${String(Date.now() - submitted)} ms`);
    const ready = readyRows(
      threadsWith(seeded.messages(), (message) => message.mailbox === 'INBOX'),
    );
    const rows = await waitForInbox(page, ready);
    step(`first ${String(rows)} rows visible after ${String(Date.now() - submitted)} ms`);
    await timed;
    await screenshot('inbox');
    const subject = await openThreadAt(page, 0);
    step(`opened newest thread "${subject}"`);
    await screenshot('newest-thread');
  },
});
