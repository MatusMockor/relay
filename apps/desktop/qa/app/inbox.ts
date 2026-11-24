import type { Locator, Page } from 'playwright';

const ROW = '.a-row';
const LIST_TIMEOUT_MS = 120_000;

export const threadRows = (page: Page): Locator => page.locator(ROW);

export const threadRow = (page: Page, subject: string): Locator =>
  page.locator(ROW, { has: page.locator('.subj', { hasText: subject }) }).first();

export const waitForInbox = async (page: Page, minRows = 1): Promise<number> => {
  await page.waitForFunction(
    ({ selector, min }) => document.querySelectorAll(selector).length >= min,
    { selector: ROW, min: minRows },
    { timeout: LIST_TIMEOUT_MS, polling: 250 },
  );
  return threadRows(page).count();
};

export const waitForRowCount = (page: Page, count: number): Promise<unknown> =>
  page.waitForFunction(
    ({ selector, expected }) => document.querySelectorAll(selector).length === expected,
    { selector: ROW, expected: count },
    { timeout: LIST_TIMEOUT_MS, polling: 250 },
  );

export const waitForThreadRow = (page: Page, subject: string): Promise<void> =>
  threadRow(page, subject).waitFor({ timeout: LIST_TIMEOUT_MS });

export const waitForThreadGone = (page: Page, subject: string): Promise<void> =>
  threadRow(page, subject).waitFor({ state: 'detached', timeout: LIST_TIMEOUT_MS });

export const selectThread = async (page: Page, subject: string): Promise<void> => {
  await waitForThreadRow(page, subject);
  await threadRow(page, subject).hover();
};

export const listedSubjects = async (page: Page): Promise<string[]> =>
  (await page.locator(`${ROW} .subj`).allInnerTexts()).map((text) => text.trim());

export const rowIsListed = async (
  page: Page,
  subject: string,
  timeoutMs = 5_000,
): Promise<boolean> =>
  threadRow(page, subject)
    .waitFor({ timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
