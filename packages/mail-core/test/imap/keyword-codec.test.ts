import { describe, expect, it } from 'vitest';
import { decodeKeyword, encodeKeyword } from '../../src/imap/keyword-codec';

describe('keyword codec', () => {
  it.each([
    ['$label1', '$label1'],
    ['relay-done', 'relay-done'],
    ['R&D', 'R&D'],
    ['Faktúry', 'Fakt&APo-ry'],
    ['Moje veci', 'Moje&ACA-veci'],
    ['A (B)', 'A&ACAAKA-B&ACk-'],
    ['50% "zľava"', '50&ACUAIAAi-z&AT4-ava&ACI-'],
    ['\\Pseudo', '&AFw-Pseudo'],
    ['Moje&ACA-veci', 'Moje&-ACA-veci'],
    ['Tom & Jerry', 'Tom&ACA-&-&ACA-Jerry'],
  ])('encodes %s as %s', (name, keyword) => {
    expect(encodeKeyword(name)).toBe(keyword);
    expect(decodeKeyword(keyword)).toBe(name);
  });

  it.each(['Faktúry', 'Moje veci', '日本語 štítok', 'a]b{c}*%', 'x&y', '&-', 'Ünïcødé 🙂'])(
    'round-trips %s',
    (name) => {
      const keyword = encodeKeyword(name);
      expect(keyword).toMatch(/^[!#$&'+-[^-z|}~]+$/);
      expect(decodeKeyword(keyword)).toBe(name);
    },
  );

  it('keeps foreign keywords that are not Relay encodings unchanged', () => {
    expect(decodeKeyword('A&B-C')).toBe('A&B-C');
    expect(decodeKeyword('Fakt&APo-ry-')).toBe('Faktúry-');
    expect(decodeKeyword('Junk')).toBe('Junk');
  });
});
