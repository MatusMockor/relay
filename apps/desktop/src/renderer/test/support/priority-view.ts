import { act, fireEvent, screen, within } from '@testing-library/react';
import { expect } from 'vitest';
import { press } from '../features-support';

export const CSV_SUBJECT = 'WEB-479';

const listbox = () => screen.getByRole('listbox', { name: 'Konverzácie' });

export const groupLabels = (): string[] =>
  Array.from(listbox().querySelectorAll('.a-prio .a-day-label')).map((node) => node.textContent);

export const rowSubjects = (): string[] =>
  within(listbox())
    .getAllByRole('option')
    .map((row) => row.querySelector('.subj')?.textContent.trim() ?? '');

export const groupOfRow = (subject: string): string | null =>
  within(listbox())
    .getAllByRole('group')
    .find((group) =>
      within(group)
        .queryAllByRole('option')
        .some((row) => row.textContent.includes(subject)),
    )
    ?.getAttribute('aria-label') ?? null;

export const selectRow = (subject: string): void => {
  const row = within(listbox())
    .getAllByRole('option')
    .find((option) => option.textContent.includes(subject));
  expect(row).toBeDefined();
  act(() => {
    fireEvent.click(row ?? document.body);
  });
  press('Escape', {}, document.body);
};

export const chord = (code: string, key: string): void => {
  press('p', {}, document.body);
  press(key, { code }, document.body);
};
