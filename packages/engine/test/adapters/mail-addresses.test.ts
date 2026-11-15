import { describe, expect, it } from 'vitest';
import { buildRawMessage, formatAddress } from '../support/mail/raw-message';
import { SimpleMessageParser } from '../support/mail/simple-message-parser';

const JANE = { name: 'Doe, Jane', email: 'jane@example.test' };
const QUOTER = { name: 'Ann "The \\ Admin"', email: 'ann@example.test' };

const rawWith = (headers: Readonly<Record<string, string>>): Uint8Array =>
  new TextEncoder().encode(
    `${Object.entries(headers)
      .map(([name, value]) => `${name}: ${value}`)
      .join('\r\n')}\r\n\r\nBody`,
  );

describe('raw message address formatting', () => {
  it('quotes display names and escapes quotes and backslashes', () => {
    expect(formatAddress(JANE)).toBe('"Doe, Jane" <jane@example.test>');
    expect(formatAddress(QUOTER)).toBe('"Ann \\"The \\\\ Admin\\"" <ann@example.test>');
    expect(formatAddress({ name: null, email: 'bare@example.test' })).toBe('bare@example.test');
  });
});

describe('SimpleMessageParser addresses', () => {
  it('keeps commas inside quoted display names', async () => {
    const parsed = await new SimpleMessageParser().parse(
      rawWith({
        From: '"Doe, Jane" <jane@example.test>',
        To: '"Smith, John" <john@example.test>, plain@example.test, Bob <bob@example.test>',
      }),
    );

    expect(parsed.from).toEqual(JANE);
    expect(parsed.to).toEqual([
      { name: 'Smith, John', email: 'john@example.test' },
      { name: null, email: 'plain@example.test' },
      { name: 'Bob', email: 'bob@example.test' },
    ]);
  });

  it('round-trips names with escaped quotes and backslashes', async () => {
    const parsed = await new SimpleMessageParser().parse(
      buildRawMessage({
        messageId: '<m1@mail.test>',
        from: QUOTER,
        to: [JANE, { name: null, email: 'bare@example.test' }],
        subject: 'Hello',
        date: '2026-11-15T08:00:00.000Z',
        body: 'Body',
      }),
    );

    expect(parsed.from).toEqual(QUOTER);
    expect(parsed.to).toEqual([JANE, { name: null, email: 'bare@example.test' }]);
  });
});
