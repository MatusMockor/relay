import { join } from 'node:path';
import type { Page } from 'playwright';
import { freshScenarioDir } from './screenshot-dir';

const slugOf = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');

export class ScreenshotBook {
  private taken = 0;

  private constructor(
    private readonly page: Page,
    readonly dir: string,
  ) {}

  static async open(page: Page, scenario: string): Promise<ScreenshotBook> {
    return new ScreenshotBook(page, await freshScenarioDir(scenario));
  }

  async take(name: string): Promise<string> {
    this.taken += 1;
    const file = join(this.dir, `${String(this.taken).padStart(2, '0')}-${slugOf(name)}.png`);
    await this.page.screenshot({ path: file });
    console.error(`screenshot ${file}`);
    return file;
  }
}
