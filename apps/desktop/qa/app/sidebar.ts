import type { Page } from 'playwright';

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const openSidebarFolder = async (page: Page, name: string): Promise<void> => {
  await page
    .locator('button.f', {
      has: page.locator('.fl', { hasText: new RegExp(`^${escaped(name)}$`) }),
    })
    .first()
    .click();
};
