import { describe, expect, it } from 'vitest';
import { dayGroupName, dayGroupOf, threadTimeLabel } from './day-groups';

const at = (month: number, day: number, hours = 10, minutes = 0, year = 2026): string =>
  new Date(year, month - 1, day, hours, minutes).toISOString();

describe('dayGroupOf', () => {
  const now = new Date(2026, 10, 19, 12, 0);

  it('labels today and yesterday with the full weekday and date', () => {
    expect(dayGroupOf(at(11, 19, 9, 5), now)).toEqual({ label: 'Dnes', date: 'štvrtok 19. 11.' });
    expect(dayGroupOf(at(11, 18, 16, 30), now)).toEqual({
      label: 'Včera',
      date: 'streda 18. 11.',
    });
  });

  it('keeps future dates under today', () => {
    expect(dayGroupOf(at(11, 21), now)).toEqual({ label: 'Dnes', date: 'štvrtok 19. 11.' });
  });

  it('gives each earlier day of the current week its own group', () => {
    expect(dayGroupOf(at(11, 17), now)).toEqual({ label: 'Utorok', date: '17. 11.' });
    expect(dayGroupOf(at(11, 16, 0, 0), now)).toEqual({ label: 'Pondelok', date: '16. 11.' });
  });

  it('groups the previous week without a date part', () => {
    expect(dayGroupOf(at(11, 15, 23, 59), now)).toEqual({ label: 'Minulý týždeň', date: null });
    expect(dayGroupOf(at(11, 9, 0, 0), now)).toEqual({ label: 'Minulý týždeň', date: null });
  });

  it('falls back to the month, adding the year outside the current one', () => {
    expect(dayGroupOf(at(11, 8, 23, 59), now)).toEqual({ label: 'November', date: null });
    expect(dayGroupOf(at(10, 3), now)).toEqual({ label: 'Október', date: null });
    expect(dayGroupOf(at(12, 24, 10, 0, 2025), now)).toEqual({
      label: 'December 2025',
      date: null,
    });
  });

  it('treats Sunday as yesterday and Saturday as the previous week on a Monday', () => {
    const monday = new Date(2026, 10, 16, 8, 0);
    expect(dayGroupOf(at(11, 15, 22, 0), monday)).toEqual({
      label: 'Včera',
      date: 'nedeľa 15. 11.',
    });
    expect(dayGroupOf(at(11, 14, 22, 0), monday)).toEqual({ label: 'Minulý týždeň', date: null });
  });
});

describe('dayGroupName', () => {
  it('joins both parts of a dated group', () => {
    expect(dayGroupName({ label: 'Včera', date: 'streda 18. 11.' })).toBe('Včera, streda 18. 11.');
    expect(dayGroupName({ label: 'Minulý týždeň', date: null })).toBe('Minulý týždeň');
  });
});

describe('threadTimeLabel', () => {
  const now = new Date(2026, 10, 19, 12, 0);

  it('shows only the time for days that have their own header', () => {
    expect(threadTimeLabel(at(11, 19, 9, 5), now)).toBe('9:05');
    expect(threadTimeLabel(at(11, 18, 16, 30), now)).toBe('16:30');
    expect(threadTimeLabel(at(11, 16, 7, 45), now)).toBe('7:45');
  });

  it('keeps the real date for a message dated after today', () => {
    expect(threadTimeLabel(at(11, 21, 10, 0), now)).toBe('21. 11.');
  });

  it('keeps a date for the previous week and older months', () => {
    expect(threadTimeLabel(at(11, 14, 9, 0), now)).toBe('so');
    expect(threadTimeLabel(at(11, 10, 9, 0), now)).toBe('10. 11.');
    expect(threadTimeLabel(at(10, 3, 9, 0), now)).toBe('3. 10.');
  });
});
