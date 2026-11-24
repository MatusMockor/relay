import { fillImapAccount, submitAccountForm } from '../app/imap-account';
import { continueWithoutAccount } from '../app/onboarding';
import { gmailAccountInput } from '../gmail/gmail-account-input';
import type { GmailScenarioContext } from './gmail-scenario';

export const fillGmailAccount = async (context: GmailScenarioContext): Promise<void> => {
  await continueWithoutAccount(context.page);
  await fillImapAccount(context.page, gmailAccountInput(context.gmail));
};

export const submitGmailAccount = async (
  context: GmailScenarioContext,
  submitted: number,
): Promise<void> => {
  await submitAccountForm(context.page);
  context.step(`Gmail account added through the IMAP form in ${String(Date.now() - submitted)} ms`);
};

export const addGmailAccount = async (context: GmailScenarioContext): Promise<void> => {
  await fillGmailAccount(context);
  await submitGmailAccount(context, Date.now());
};
