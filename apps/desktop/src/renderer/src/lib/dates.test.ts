import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agoLabel } from './dates';
import { dayGroupOf } from './day-groups';
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
    expect(dayGroupOf('2026-10-26T04:30:00.000Z', now)).toEqual({
      label: 'Minulý týždeň',
      date: null,
    });
    expect(dayGroupOf('2026-10-25T23:30:00.000Z', now)).toEqual({ label: 'Október', date: null });
  });
});

describe('truncate', () => {
  it('returns nothing for a zero or negative maximum', () => {
    expect(truncate('abcdef', 0)).toBe('');
    expect(truncate('abcdef', -3)).toBe('');
    expect(truncate('abcdef', 4)).toBe('abc…');
  });
});

describe('agoLabel', () => {
  const now = new Date('2026-11-18T12:00:00.000Z');

  it('tells how long ago something happened in Slovak', () => {
    expect(agoLabel('2026-11-18T11:59:30.000Z', now)).toBe('pred chvíľou');
    expect(agoLabel('2026-11-18T11:48:00.000Z', now)).toBe('pred 12 min');
    expect(agoLabel('2026-11-18T09:00:00.000Z', now)).toBe('pred 3 h');
    expect(agoLabel('2026-11-17T10:00:00.000Z', now)).toBe('pred dňom');
    expect(agoLabel('2026-11-15T12:00:00.000Z', now)).toBe('pred 3 dňami');
  });
});
