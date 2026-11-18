import { describe, expect, it } from 'vitest';
import { decodeKeyword, encodeKeyword, keywordKey } from '../../src/services/labels/keyword-codec';

const asciiUpper = (value: string): string => value.replace(/[a-z]/g, (char) => char.toUpperCase());

describe('keyword codec', () => {
  it.each([
    ['$label1', '$label1'],
    ['relay-done', 'relay-done'],
    ['R&D', 'R&D'],
    ['Faktúry', 'Fakt&c3ba-ry'],
    ['Moje veci', 'Moje&20-veci'],
    ['A (B)', 'A&2028-B&29-'],
    ['\\Pseudo', '&5c-Pseudo'],
    ['Tom & Jerry', 'Tom&20-&-&20-Jerry'],
  ])('encodes %s as %s', (name, keyword) => {
    expect(encodeKeyword(name)).toBe(keyword);
    expect(decodeKeyword(keyword)).toBe(name);
  });

  it.each(['Faktúry', 'Moje veci', '日本語 štítok', 'a]b{c}*%', 'x & y', 'Ünïcødé 🙂', 'É', 'ɩ'])(
    'round-trips %s through an atom that survives case folding',
    (name) => {
      const keyword = encodeKeyword(name);
      expect(keyword).toMatch(/^[!#$&'+-[^-z|}~]+$/);
      expect(decodeKeyword(keyword)).toBe(name);
      expect(decodeKeyword(keyword.toUpperCase())).toBe(asciiUpper(name));
    },
  );

  it('gives letters that differ only in case different keywords', () => {
    expect(keywordKey(encodeKeyword('É'))).not.toBe(keywordKey(encodeKeyword('ɩ')));
    expect(keywordKey(encodeKeyword('Účty'))).not.toBe(keywordKey(encodeKeyword('účty')));
  });

  it('shows foreign keywords that are not Relay encodings unchanged', () => {
    expect(decodeKeyword('A&B-C')).toBe('A&B-C');
    expect(decodeKeyword('&-')).toBe('&-');
    expect(decodeKeyword('Fakt&APo-ry')).toBe('Fakt&APo-ry');
    expect(decodeKeyword('&ff-')).toBe('&ff-');
    expect(decodeKeyword('Junk')).toBe('Junk');
  });
});
