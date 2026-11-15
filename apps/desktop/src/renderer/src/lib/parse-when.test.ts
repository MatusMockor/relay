import { describe, expect, it } from 'vitest';
import { describeWhen } from './dates';
import { parseWhen } from './parse-when';

const NOW = new Date(2026, 10, 19, 9, 41);

describe('parseWhen', () => {
  it('understands Slovak relative and absolute phrases', () => {
    expect(parseWhen('zajtra 9:00', NOW)).toEqual(new Date(2026, 10, 20, 9, 0));
    expect(parseWhen('o 2 hodiny', NOW)).toEqual(new Date(2026, 10, 19, 11, 41));
    expect(parseWhen('za pol hodiny', NOW)).toEqual(new Date(2026, 10, 19, 10, 11));
    expect(parseWhen('piatok', NOW)).toEqual(new Date(2026, 10, 20, 8, 0));
    expect(parseWhen('v pondelok poobede', NOW)).toEqual(new Date(2026, 10, 23, 14, 0));
    expect(parseWhen('24. 12. o 18:30', NOW)).toEqual(new Date(2026, 11, 24, 18, 30));
    expect(parseWhen('Večer', NOW)).toEqual(new Date(2026, 10, 19, 18, 0));
  });

  it('rejects nonsense and the past', () => {
    expect(parseWhen('niekedy', NOW)).toBeNull();
    expect(parseWhen('dnes 7:00', NOW)).toBeNull();
    expect(parseWhen('25:00', NOW)).toBeNull();
  });

  it('describes dates in Slovak', () => {
    expect(describeWhen(new Date(2026, 10, 20, 8, 0), NOW).phrase).toBe('zajtra o 8:00');
    expect(describeWhen(new Date(2026, 10, 23, 8, 0), NOW).phrase).toBe('v pondelok o 8:00');
  });
});
