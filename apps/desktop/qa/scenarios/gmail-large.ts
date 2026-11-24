import { waitForInbox } from '../app/inbox';
import { openThreadAt, threadFacts } from '../app/thread-view';
import { captureAt } from '../capture/timed-capture';
import { readQaEnv } from '../config/qa-env';
import { gmailLargeAccount } from '../gmail/gmail-large-account';
import { gmailInboxThreads } from '../gmail/gmail-thread-count';
import { readyRows } from '../seed/thread-count';
import { fillGmailAccount, submitGmailAccount } from './gmail-onboard';
import type { GmailScenarioContext } from './gmail-scenario';
import { runGmailScenario } from './gmail-scenario';

const DEFAULT_COUNT = 10_000;
const AFTER_ADD_OFFSETS_MS: readonly number[] = [2_000, 5_000, 10_000, 30_000];

const count = readQaEnv().QA_COUNT ?? DEFAULT_COUNT;

const listInbox = async (context: GmailScenarioContext, submitted: number): Promise<void> => {
  await submitGmailAccount(context, submitted);
  const ready = readyRows(gmailInboxThreads(context.seed));
  const rows = await waitForInbox(context.page, ready);
  context.step(
    `${String(rows)} rows visible (needed ${String(ready)}) after ${String(Date.now() - submitted)} ms`,
  );
};

await runGmailScenario({
  name: 'gmail-large',
  seed: (gmail) => gmailLargeAccount(gmail.account.email, { count }),
  run: async (context) => {
    await fillGmailAccount(context);
    const submitted = Date.now();
    await Promise.all([
      listInbox(context, submitted),
      captureAt(context.shots, 'after-add', AFTER_ADD_OFFSETS_MS, submitted),
    ]);
    await context.screenshot('inbox');
    const subject = await openThreadAt(context.page, 0);
    const facts = await threadFacts(context.page);
    context.step(
      `newest thread "${subject}": ${facts.meta}, ${String(facts.messageElements)} message elements`,
    );
    await context.screenshot('newest-thread');
  },
});
