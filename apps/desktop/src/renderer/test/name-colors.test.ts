import { describe, expect, it } from 'vitest';
import {
  ACCENT_STAND_IN,
  accountHue,
  createNameColors,
  NAME_HUES,
  NEUTRAL,
} from '../src/features/colors/name-colors';

const accounts = [
  { name: 'eFabrica', color: '#6aa8ff' },
  { name: 'Osobný', color: '#74c4a2' },
  { name: 'Freelance', color: '#d9a878' },
];

const labels = [
  { id: 'l-1', name: 'eFabrica' },
  { id: 'l-2', name: 'Jira' },
  { id: 'l-3', name: 'Klienti' },
  { id: 'l-4', name: 'Rodina' },
];

describe('presentation colours by name', () => {
  it('gives a label the colour of the account with the same name', () => {
    expect(createNameColors(accounts, labels).of('eFabrica')).toBe('#6aa8ff');
  });

  it('gives a split the colour of the label with the same name', () => {
    const colors = createNameColors(accounts, labels);

    expect(colors.of('Jira')).toBe(colors.of('jira'));
    expect(colors.of('Klienti')).not.toBe(colors.of('Jira'));
    expect(NAME_HUES).toContain(colors.of('Klienti'));
  });

  it('keeps other labels distinct and away from account colours', () => {
    const colors = createNameColors(accounts, labels);
    const hues = ['Jira', 'Klienti', 'Rodina'].map((name) => colors.of(name));

    expect(new Set(hues).size).toBe(3);
    expect(hues.some((hue) => accounts.some((account) => account.color === hue))).toBe(false);
  });

  it('uses a neutral dot for a split without a matching label', () => {
    expect(createNameColors(accounts, labels).of('Ostatné')).toBe(NEUTRAL);
  });

  it('never shows an account in the unread accent', () => {
    expect(accountHue('#8EA2FF')).toBe(ACCENT_STAND_IN);
    expect(accountHue('#74c4a2')).toBe('#74c4a2');
  });
});
