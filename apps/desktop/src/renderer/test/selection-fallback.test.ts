import { describe, expect, it } from 'vitest';
import { threadItem } from '../src/features/mail/list-items';
import { replacementKeyOf } from '../src/features/mail/selection-fallback';
import { bulkThread } from './support/bulk-demo-threads';

const NOW = new Date(2026, 10, 19, 12, 0);
const items = (...indexes: number[]) => indexes.map((index) => threadItem(bulkThread(index, NOW)));
const keyOf = (index: number): string => threadItem(bulkThread(index, NOW)).key;

describe('replacementKeyOf', () => {
  it('selects the thread that took the place of the removed one', () => {
    expect(replacementKeyOf(keyOf(2), items(0, 1, 2, 3, 4), items(0, 1, 3, 4))).toBe(keyOf(3));
  });

  it('skips neighbours that were removed together with it', () => {
    expect(replacementKeyOf(keyOf(2), items(0, 1, 2, 3, 4), items(0, 1, 4))).toBe(keyOf(4));
  });

  it('falls back to the previous thread when the last one was removed', () => {
    expect(replacementKeyOf(keyOf(4), items(0, 1, 2, 3, 4), items(0, 1, 2, 3))).toBe(keyOf(3));
  });

  it('does not guess for a thread the list never showed', () => {
    expect(replacementKeyOf(keyOf(9), items(0, 1, 2), items(0, 1))).toBeNull();
    expect(replacementKeyOf(keyOf(0), items(0), [])).toBeNull();
  });
});
