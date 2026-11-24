import type { Page } from 'playwright';
import { ScreenshotBook } from './screenshot-book';

export const continuedBooks = (scenario: string): ((page: Page) => Promise<ScreenshotBook>) => {
  let last: ScreenshotBook | null = null;
  return async (page) => {
    last = last === null ? await ScreenshotBook.open(page, scenario) : last.forPage(page);
    return last;
  };
};
