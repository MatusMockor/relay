import { describe, expect, it } from 'vitest';
import { toPrefixTsQuery } from '../../src/persistence/repositories/threads/search-query';

describe('toPrefixTsQuery', () => {
  it.each([
    ['budget,forecast', 'budget:* & forecast:*'],
    ['budget;forecast!q3', 'budget:* & forecast:* & q3:*'],
    ['jan.kovac@relay.test', 'jan:* & kovac:* & relay:* & test:*'],
    ['Faktúra (október)', 'faktúra:* & október:*'],
  ])('turns %s into %s', (search, expected) => {
    expect(toPrefixTsQuery(search)).toBe(expected);
  });

  it('returns null without any word', () => {
    expect(toPrefixTsQuery('!!! ,,,')).toBeNull();
    expect(toPrefixTsQuery(null)).toBeNull();
  });
});
