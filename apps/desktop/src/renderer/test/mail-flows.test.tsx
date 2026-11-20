// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderApp, resetStores } from './support/render-app';

const key = (value: string, init: KeyboardEventInit = {}) => {
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: value, ...init });
  });
};

const rows = () =>
  within(screen.getByRole('listbox', { name: 'Konverzácie' })).getAllByRole('option');
const subjectOf = (row: HTMLElement) => row.querySelector('.subj')?.textContent.trim() ?? '';
const selectedSubject = () =>
  subjectOf(rows().find((row) => row.getAttribute('aria-selected') === 'true') ?? document.body);
const toast = () => screen.getByRole('status', { hidden: false });

describe('mail flows', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('moves with j/k, opens with Enter and goes back with Esc', async () => {
    renderApp();
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    const first = subjectOf(rows()[0] ?? document.body);
    const second = subjectOf(rows()[1] ?? document.body);
    expect(selectedSubject()).toBe(first);
    key('j');
    expect(selectedSubject()).toBe(second);
    key('k');
    key('Enter');
    expect(await screen.findByRole('heading', { level: 1, name: first })).toBeDefined();
    expect(screen.getByRole('button', { name: /Späť do zoznamu|Dôležité/ })).toBeDefined();
    key('Escape');
    expect(await screen.findByRole('listbox', { name: 'Konverzácie' })).toBeDefined();
    expect(selectedSubject()).toBe(first);
  });

  it('switches folders with g-sequences and Tab, and opens the palette and shortcuts', async () => {
    renderApp();
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    key('g');
    key('d');
    expect(await screen.findByRole('heading', { name: /Koncepty/ })).toBeDefined();
    key('g');
    key('i');
    const main = await screen.findByRole('tab', { name: /Dôležité/ });
    expect(main.getAttribute('aria-selected')).toBe('true');
    key('Tab');
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Úlohy/ }).getAttribute('aria-selected')).toBe('true');
    });
    key('?');
    expect(screen.getByRole('dialog', { name: 'Klávesové skratky' })).toBeDefined();
    key('Escape');
    expect(screen.queryByRole('dialog', { name: 'Klávesové skratky' })).toBeNull();
    key('k', { ctrlKey: true });
    const input = screen.getByRole('textbox', { name: 'Hľadať príkaz' });
    fireEvent.change(input, { target: { value: 'kôš' } });
    key('Enter');
    expect(await screen.findByRole('heading', { name: /Kôš/ })).toBeDefined();
  });

  it('marks a conversation done and brings it back with undo', async () => {
    renderApp();
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    const subject = selectedSubject();
    key('e');
    expect(toast().textContent).toContain('Hotovo');
    await waitFor(() => {
      expect(rows().map(subjectOf)).not.toContain(subject);
    });
    key('g');
    key('e');
    await waitFor(() => {
      expect(rows().map(subjectOf)).toContain(subject);
      expect(rows().map(subjectOf)).not.toContain('Re: Onboarding checklist');
    });
    key('z');
    key('g');
    key('i');
    await waitFor(() => {
      expect(rows().map(subjectOf)).toContain(subject);
    });
    expect(toast().textContent).toContain('Vrátené');
  });

  it('returns an archived conversation to Archive when restoring it is undone', async () => {
    renderApp();
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    key('g');
    key('a');
    await waitFor(() => {
      expect(selectedSubject()).toBe('Re: Onboarding checklist');
    });
    key('e');
    expect(await screen.findByRole('heading', { name: 'Archív je prázdny' })).toBeDefined();
    key('z');
    await waitFor(() => {
      expect(rows().map(subjectOf)).toEqual(['Re: Onboarding checklist']);
    });
  });

  it('snoozes with a Slovak time phrase', async () => {
    renderApp();
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    const subject = selectedSubject();
    key('h');
    const input = screen.getByRole('textbox', { name: 'Vlastný čas' });
    fireEvent.change(input, { target: { value: 'zajtra 9:00' } });
    expect(screen.getByText('→ Zajtra o 9:00')).toBeDefined();
    key('Enter');
    expect(toast().textContent).toContain('Pripomenie sa zajtra o 9:00');
    await waitFor(() => {
      expect(rows().map(subjectOf)).not.toContain(subject);
    });
  });
});
