import type { Page } from 'playwright';

const COMMAND_DIALOG = { name: 'Príkazy' } as const;

export const runPaletteCommand = async (page: Page, label: string): Promise<void> => {
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog', COMMAND_DIALOG);
  await dialog.waitFor();
  await dialog.getByRole('textbox', { name: 'Hľadať príkaz' }).fill(label);
  await dialog.locator('.pi', { hasText: label }).first().click();
  await dialog.waitFor({ state: 'detached' });
};

export const pickMoveTarget = async (page: Page, target: string): Promise<void> => {
  const dialog = page.getByRole('dialog', { name: 'Presunúť do' });
  await dialog.waitFor();
  await dialog.getByRole('textbox', { name: 'Hľadať priečinok' }).fill(target);
  await dialog.getByRole('option', { name: target }).first().click();
  await dialog.waitFor({ state: 'detached' });
};

export const searchMail = async (page: Page, query: string): Promise<void> => {
  await page.keyboard.press('/');
  const input = page.getByRole('combobox', { name: /Hľadať/ });
  await input.waitFor();
  await input.fill(query);
  await page
    .getByRole('listbox', { name: 'Výsledky hľadania' })
    .locator('[role="option"]')
    .first()
    .waitFor();
  await page.keyboard.press('Control+Enter');
};
