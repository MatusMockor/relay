import { describe, expect, it } from 'vitest';
import { toSearchTerms } from '../../src/persistence/repositories/threads/search-query';

describe('toSearchTerms', () => {
  it.each([
    ['budget,forecast', ['budget', 'forecast']],
    ['budget;forecast!q3', ['budget', 'forecast', 'q3']],
    ['jan.kovac@relay.test', ['jan', 'kovac', 'relay', 'test']],
    ['Faktúra (október)', ['faktúra', 'október']],
    ['किताब', ['किताब']],
  ])('splits %s into %j', (search, expected) => {
    expect(toSearchTerms(search)).toEqual(expected);
  });

  it('returns no terms without any word', () => {
    expect(toSearchTerms('!!! ,,,')).toEqual([]);
    expect(toSearchTerms(null)).toEqual([]);
  });
});
