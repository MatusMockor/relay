import type { Page } from 'playwright';
import { launchApp, type LaunchOptions } from '../app/launch-app';
import type { QaApp } from '../app/qa-app';
import { ScreenshotBook } from '../capture/screenshot-book';

export interface AppSession {
  readonly app: QaApp;
  readonly page: Page;
  readonly shots: ScreenshotBook;
  readonly screenshot: (name: string) => Promise<string>;
  readonly step: (label: string) => void;
}

export const scenarioLog = (scenario: string) => (label: string) => {
  console.error(`[${scenario}] ${label}`);
};

export const withAppSession = async (
  scenario: string,
  options: LaunchOptions,
  run: (session: AppSession) => Promise<void>,
): Promise<void> => {
  const app = await launchApp(options);
  let shots: ScreenshotBook | null = null;
  let passed = false;
  try {
    const book = await ScreenshotBook.open(app.page, scenario);
    shots = book;
    await run({
      app,
      page: app.page,
      shots: book,
      screenshot: (name) => book.take(name),
      step: scenarioLog(scenario),
    });
    passed = true;
  } finally {
    if (!passed) {
      await shots?.take('failure').catch(() => undefined);
      console.error(`App log: ${app.logFile}`);
    }
    await app.close();
  }
};

export const reportScenario = async (
  scenario: string,
  work: () => Promise<void>,
): Promise<void> => {
  try {
    await work();
    scenarioLog(scenario)('passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
};
