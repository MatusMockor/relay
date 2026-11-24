import { addImapAccount, imapAccountOf } from '../app/imap-account';
import { waitForInbox } from '../app/inbox';
import { continueWithoutAccount } from '../app/onboarding';
import type { ScenarioContext } from './scenario-context';

export const onboardGreenMail = async (context: ScenarioContext, minRows = 1): Promise<number> => {
  context.step('local mode');
  await continueWithoutAccount(context.page);
  context.step(`adding IMAP account ${context.user.email}`);
  await addImapAccount(context.page, imapAccountOf(context.user));
  const rows = await waitForInbox(context.page, minRows);
  context.step(`inbox shows ${String(rows)} rows`);
  return rows;
};
