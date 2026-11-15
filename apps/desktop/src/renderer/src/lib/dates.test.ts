import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dayGroupOf } from './dates';
import { truncate } from './text';

describe('dayGroupOf across a daylight saving change', () => {
  const zone = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });

  afterAll(() => {
    process.env.TZ = zone;
  });

  it('starts the previous week at local midnight', () => {
    const now = new Date('2026-11-02T17:00:00.000Z');
    expect(dayGroupOf('2026-10-26T04:30:00.000Z', now)).toBe('Minulý týždeň');
    expect(dayGroupOf('2026-10-25T23:30:00.000Z', now)).toBe('Október');
  });
});

describe('truncate', () => {
  it('returns nothing for a zero or negative maximum', () => {
    expect(truncate('abcdef', 0)).toBe('');
    expect(truncate('abcdef', -3)).toBe('');
    expect(truncate('abcdef', 4)).toBe('abc…');
  });
});
