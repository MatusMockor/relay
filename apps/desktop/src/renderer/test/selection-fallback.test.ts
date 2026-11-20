import { describe, expect, it } from 'vitest';
import { threadItem } from '../src/features/mail/list-items';
import { replacementKeyOf } from '../src/features/mail/selection-fallback';
import { bulkThread } from './support/bulk-demo-threads';

const NOW = new Date(2026, 10, 19, 12, 0);
const items = (...indexes: number[]) => indexes.map((index) => threadItem(bulkThread(index, NOW)));
const complete = (...indexes: number[]) => ({ items: items(...indexes), hasMore: false });
const partial = (...indexes: number[]) => ({ items: items(...indexes), hasMore: true });
const keyOf = (index: number): string => threadItem(bulkThread(index, NOW)).key;

describe('replacementKeyOf', () => {
  it('selects the thread that took the place of the removed one', () => {
    expect(replacementKeyOf(keyOf(2), items(0, 1, 2, 3, 4), complete(0, 1, 3, 4))).toBe(keyOf(3));
  });

  it('skips neighbours that were removed together with it', () => {
    expect(replacementKeyOf(keyOf(2), items(0, 1, 2, 3, 4), complete(0, 1, 4))).toBe(keyOf(4));
  });

  it('falls back to the previous thread when the last one was removed', () => {
    expect(replacementKeyOf(keyOf(4), items(0, 1, 2, 3, 4), complete(0, 1, 2, 3))).toBe(keyOf(3));
  });

  it('replaces a thread that vanished inside the loaded part of a partial list', () => {
    expect(replacementKeyOf(keyOf(2), items(0, 1, 2, 3), partial(0, 1, 3))).toBe(keyOf(3));
  });

  it('keeps the selection when the thread only fell out of the loaded part of the list', () => {
    expect(replacementKeyOf(keyOf(3), items(0, 1, 2, 3), partial(-1, 0, 1, 2))).toBeNull();
  });

  it('selects the previous thread when the last loaded one is deleted from a partial list', () => {
    expect(replacementKeyOf(keyOf(2), items(0, 1, 2), partial(0, 1))).toBe(keyOf(1));
  });

  it('does not guess for a thread the list never showed', () => {
    expect(replacementKeyOf(keyOf(9), items(0, 1, 2), complete(0, 1))).toBeNull();
    expect(replacementKeyOf(keyOf(0), items(0), complete())).toBeNull();
  });
});
