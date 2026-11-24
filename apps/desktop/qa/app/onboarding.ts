import type { Page } from 'playwright';

export const ACCOUNT_STEP_TITLE = 'Pridať e-mailový účet';

export const continueWithoutAccount = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /Pokračovať bez účtu/ }).click();
  await page.getByRole('heading', { name: ACCOUNT_STEP_TITLE }).waitFor();
};
