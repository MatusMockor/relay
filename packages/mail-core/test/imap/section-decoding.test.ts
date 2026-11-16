import { describe, expect, it } from 'vitest';
import { calendarSections } from '../../src/imap/calendar-sections';
import { decodeSection } from '../../src/imap/section-decoding';
import { MAX_CALENDAR_PART_BYTES } from '../../src/parser/calendar-part-rules';

const wrappedBase64 = (bytes: Buffer): Buffer =>
  Buffer.from((bytes.toString('base64').match(/.{1,76}/g) ?? []).join('\r\n'));

describe('calendar section decoding', () => {
  it('decodes quoted-printable with soft line breaks in the declared charset', () => {
    const raw = Buffer.from('SUMMARY:Pl=E1novanie =9Aprintu a dlh=FD =\r\nriadok', 'latin1');

    expect(
      decodeSection(raw, { part: '2', encoding: 'quoted-printable', charset: 'windows-1250' }),
    ).toBe('SUMMARY:Plánovanie šprintu a dlhý riadok');
  });

  it('decodes base64 and falls back to UTF-8 for an unknown charset', () => {
    const raw = Buffer.from(Buffer.from('SUMMARY:Ďakujem').toString('base64'));

    expect(decodeSection(raw, { part: '3', encoding: 'base64', charset: 'x-unknown' })).toBe(
      'SUMMARY:Ďakujem',
    );
  });

  it('keeps 8bit content as it is', () => {
    expect(
      decodeSection(Buffer.from('SUMMARY:Čaj'), { part: '1', encoding: '8bit', charset: 'utf-8' }),
    ).toBe('SUMMARY:Čaj');
  });

  it('limits the decoded size in bytes, not characters', () => {
    const text = 'é'.repeat(MAX_CALENDAR_PART_BYTES / 2 + 1);

    expect(
      decodeSection(Buffer.from(text), { part: '2', encoding: '8bit', charset: 'utf-8' }),
    ).toBeNull();
  });

  it('accepts a part at the decoded limit sent as wrapped base64', () => {
    const bytes = Buffer.alloc(MAX_CALENDAR_PART_BYTES, 'A');
    const raw = wrappedBase64(bytes);
    const [section] = calendarSections({
      type: 'text/calendar',
      part: '2',
      encoding: 'base64',
      size: raw.length,
      parameters: { charset: 'utf-8' },
    });

    expect(section).toEqual({ part: '2', encoding: 'base64', charset: 'utf-8' });
    expect(decodeSection(raw, { part: '2', encoding: 'base64', charset: 'utf-8' })).toHaveLength(
      MAX_CALENDAR_PART_BYTES,
    );
  });
});
