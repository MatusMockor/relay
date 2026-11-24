import type { Page } from 'playwright';
import { threadRow, threadRows, waitForThreadRow } from './inbox';

const THREAD_VIEW = '#thread';

export const openThread = async (page: Page, subject: string): Promise<void> => {
  await waitForThreadRow(page, subject);
  await threadRow(page, subject).click();
  await page.locator(`${THREAD_VIEW} .t-h1`, { hasText: subject }).waitFor();
};

export const openThreadAt = async (page: Page, index: number): Promise<string> => {
  const row = threadRows(page).nth(index);
  const subject = (await row.locator('.subj').innerText()).trim();
  await row.click();
  await page.locator(`${THREAD_VIEW} .t-h1`).waitFor();
  return subject;
};

export const closeThread = async (page: Page): Promise<void> => {
  await page.keyboard.press('Escape');
  await page.locator(THREAD_VIEW).waitFor({ state: 'detached' });
};

export const isThreadOpen = async (page: Page): Promise<boolean> =>
  (await page.locator(THREAD_VIEW).count()) > 0;

export interface ThreadFacts {
  readonly title: string;
  readonly meta: string;
  readonly messageElements: number;
}

export const threadFacts = async (page: Page): Promise<ThreadFacts> => {
  const view = page.locator(THREAD_VIEW);
  return {
    title: (await view.locator('.t-h1').innerText()).trim(),
    meta: (await view.locator('.t-meta').innerText()).replace(/\s+/g, ' ').trim(),
    messageElements: await view.locator('article.msg, button.m-c').count(),
  };
};
