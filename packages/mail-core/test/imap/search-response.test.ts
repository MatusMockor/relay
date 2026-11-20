import { describe, expect, it } from 'vitest';
import { imapDate, imapSearchAttributes } from '../../src/imap/imap-search-attributes';
import { searchResultUids } from '../../src/imap/search-response';

const atoms = (...values: string[]) => ({
  attributes: values.map((value) => ({ type: 'ATOM', value })),
});

describe('raw IMAP text search', () => {
  it('reads SEARCH and ESEARCH ALL responses and ignores malformed entries', () => {
    expect(searchResultUids(atoms('4', '9', 'x', '0', '12'))).toEqual([4, 9, 12]);
    expect(searchResultUids(atoms('UID', 'ALL', '3:5,9'))).toEqual([3, 4, 5, 9]);
    expect(searchResultUids(atoms('ALL', '1:4294967295')).length).toBe(100_000);
    expect(searchResultUids(null)).toEqual([]);
  });

  it('caps the expanded UIDs across all ranges and keeps the newest ones', () => {
    const ranges = Array.from(
      { length: 50 },
      (_, index) => `${String(index * 1_000_000 + 1)}:${String(index * 1_000_000 + 99_999)}`,
    ).join(',');
    const uids = searchResultUids(atoms('ALL', ranges));

    expect(uids.length).toBe(100_000);
    expect(uids.at(-1)).toBe(49 * 1_000_000 + 99_999);
    expect(uids[0]).toBeGreaterThan(48 * 1_000_000);
    expect(searchResultUids(atoms('ALL', '1:10,20:30'), 5)).toEqual([26, 27, 28, 29, 30]);
    expect(searchResultUids(atoms('4', '9', '12'), 2)).toEqual([9, 12]);
    expect(searchResultUids(atoms('4', '9'), 0)).toEqual([]);
  });

  it('sends non-ASCII terms as UTF-8 literals under CHARSET UTF-8', () => {
    const attributes = imapSearchAttributes({
      terms: ['kôň', 'faktura'],
      field: 'subject',
      before: new Date('2024-03-05T00:00:00.000Z'),
      limit: 50,
    });

    expect(attributes).toEqual([
      { type: 'ATOM', value: 'CHARSET' },
      { type: 'ATOM', value: 'UTF-8' },
      { type: 'ATOM', value: 'SUBJECT' },
      { type: 'LITERAL', value: Buffer.from('kôň', 'utf8') },
      { type: 'ATOM', value: 'SUBJECT' },
      { type: 'STRING', value: 'faktura' },
      { type: 'ATOM', value: 'BEFORE' },
      { type: 'ATOM', value: '05-Mar-2024' },
    ]);
    expect(imapDate(new Date('2026-12-31T23:00:00.000Z'))).toBe('31-Dec-2026');
  });
});
