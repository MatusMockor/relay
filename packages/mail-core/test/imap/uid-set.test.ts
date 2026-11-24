import { describe, expect, it } from 'vitest';
import { uidSet } from '../../src/imap/uid-batches';

describe('uidSet', () => {
  it('packs consecutive UIDs into ranges', () => {
    expect(uidSet([99_505, 99_501, 99_502, 99_503, 99_504, 99_510, 99_512, 99_511])).toBe(
      '99501:99505,99510:99512',
    );
  });

  it('keeps single UIDs, drops duplicates and answers empty for no UIDs', () => {
    expect(uidSet([7, 3, 3, 9])).toBe('3,7,9');
    expect(uidSet([])).toBe('');
  });
});
