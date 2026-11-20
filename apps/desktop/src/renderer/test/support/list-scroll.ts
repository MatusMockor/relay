import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

export const threadListbox = (): Promise<HTMLElement> =>
  screen.findByRole('listbox', { name: 'Konverzácie' });

export const scrollElementOf = (listbox: HTMLElement): HTMLElement => {
  const element = listbox.closest<HTMLElement>('.a-list');
  expect(element).not.toBeNull();
  return element ?? listbox;
};

export const scrollListTo = (listbox: HTMLElement, top: number): void => {
  const element = scrollElementOf(listbox);
  act(() => {
    element.scrollTop = top;
    fireEvent.scroll(element);
  });
};

export const scrollListToEnd = (listbox: HTMLElement): void => {
  scrollListTo(listbox, Number.parseFloat(listbox.style.height));
};

export const renderedRows = (): number => document.querySelectorAll('.a-row').length;

export const waitForRows = async (): Promise<void> => {
  await waitFor(() => {
    expect(renderedRows()).toBeGreaterThan(0);
  });
};

export const optionPositions = (listbox: HTMLElement): number[] =>
  Array.from(listbox.querySelectorAll('[role="option"]')).map((option) =>
    Number(option.getAttribute('aria-posinset')),
  );
