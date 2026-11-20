import { describe, expect, it } from 'vitest';
import { imapDate, imapSearchAttributes } from '../../src/imap/imap-search-attributes';
import { searchResponsesUids, searchResultUids } from '../../src/imap/search-response';

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

  it('keeps the newest UIDs whatever the wire order of the ranges', () => {
    const uids = searchResultUids(atoms('ALL', '200001:300000,1:100000'));

    expect(uids.length).toBe(100_000);
    expect(uids[0]).toBe(200_001);
    expect(uids.at(-1)).toBe(300_000);
    expect(searchResultUids(atoms('ALL', '50:60,1:10,30:40'), 4)).toEqual([57, 58, 59, 60]);
    expect(searchResultUids(atoms('ALL', '1:10,5:20,8'), 30)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(searchResultUids(atoms('12', '4', '9', '12'), 2)).toEqual([9, 12]);
  });

  it('keeps the newest UIDs across several untagged responses', () => {
    const uids = searchResponsesUids([
      atoms('ALL', '300001:400000'),
      atoms('ALL', '1:100000'),
      atoms('500001', '7'),
    ]);

    expect(uids.length).toBe(100_000);
    expect(uids[0]).toBe(300_002);
    expect(uids.at(-1)).toBe(500_001);
    expect(searchResponsesUids([atoms('3', '1'), atoms('ALL', '2:4')], 3)).toEqual([2, 3, 4]);
  });

  it('expands a sparse ESEARCH set in linear time', () => {
    const singletons = Array.from({ length: 200_000 }, (_, index) => String(index * 2 + 1)).join(
      ',',
    );
    const started = performance.now();
    const uids = searchResultUids(atoms('ALL', singletons));

    expect(uids.length).toBe(100_000);
    expect(uids[0]).toBe(200_001);
    expect(uids.at(-1)).toBe(399_999);
    expect(performance.now() - started).toBeLessThan(1_000);
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
