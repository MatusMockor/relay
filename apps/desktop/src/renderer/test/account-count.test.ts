import { describe, expect, it } from 'vitest';
import { accountCount } from '../src/lib/text';

describe('account count', () => {
  it('declines the Slovak noun by count', () => {
    expect([1, 2, 4, 5, 11].map(accountCount)).toEqual([
      '1 účet',
      '2 účty',
      '4 účty',
      '5 účtov',
      '11 účtov',
    ]);
  });
});
