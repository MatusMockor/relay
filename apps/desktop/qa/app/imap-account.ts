import assert from 'node:assert/strict';
import type { Locator, Page } from 'playwright';
import type { MailUser } from '../greenmail/mail-user';

export interface ImapAccountInput {
  readonly email: string;
  readonly password: string;
  readonly senderName: string;
  readonly name: string;
  readonly imapHost: string;
  readonly imapPort: number;
  readonly smtpHost: string;
  readonly smtpPort: number;
}

const ADD_TIMEOUT_MS = 60_000;

export const imapAccountOf = (
  user: MailUser,
  overrides: Partial<ImapAccountInput> = {},
): ImapAccountInput => ({
  email: user.email,
  password: user.password,
  senderName: 'QA Relay',
  name: 'GreenMail',
  imapHost: user.host,
  imapPort: user.imapPort,
  smtpHost: user.host,
  smtpPort: user.smtpPort,
  ...overrides,
});

const fillServers = async (page: Page, account: ImapAccountInput): Promise<void> => {
  const toggle = page.locator('.srv-t');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await page.locator('#acc-f-imapHost').fill(account.imapHost);
  await page.locator('#acc-f-imapPort').fill(String(account.imapPort));
  await page.locator('#acc-f-smtpHost').fill(account.smtpHost);
  await page.locator('#acc-f-smtpPort').fill(String(account.smtpPort));
};

export const fillImapAccount = async (page: Page, account: ImapAccountInput): Promise<void> => {
  await page.locator('#acc-f-email').fill(account.email);
  await page.locator('#acc-f-password').fill(account.password);
  await page.locator('#acc-f-senderName').fill(account.senderName);
  await page.locator('#acc-f-name').fill(account.name);
  await fillServers(page, account);
};

const POLL_MS = 250;

const outcomeOf = async (page: Page, form: Locator, alert: Locator): Promise<string | null> => {
  const deadline = Date.now() + ADD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await form.count()) === 0) {
      return null;
    }
    if ((await alert.count()) > 0) {
      return alert.first().innerText();
    }
    await page.waitForTimeout(POLL_MS);
  }
  return `no result within ${String(ADD_TIMEOUT_MS)} ms`;
};

export const submitAccountForm = async (page: Page): Promise<void> => {
  const form = page.locator('form.form', { has: page.locator('#acc-f-email') });
  await page.getByRole('button', { name: 'Pridať účet', exact: true }).click();
  const failure = await outcomeOf(page, form, form.locator('.err'));
  assert.equal(failure, null, `Adding the IMAP account failed: ${String(failure)}`);
};

export const addImapAccount = async (page: Page, account: ImapAccountInput): Promise<void> => {
  await fillImapAccount(page, account);
  await submitAccountForm(page);
};
