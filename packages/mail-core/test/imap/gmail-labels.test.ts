import { describe, expect, it } from 'vitest';
import { toGmailLabels } from '../../src/imap/gmail-labels';
import { detectMailboxRole } from '../../src/imap/mailbox-roles';
import { decodeModifiedUtf7 } from '../../src/imap/modified-utf7';

describe('modified UTF-7 decoding', () => {
  it.each([
    ['&ANoBDQ-ty a fakt&APo-ry', 'Účty a faktúry'],
    ['Tom &- Jerry', 'Tom & Jerry'],
    ['&ZeVnLIqe-', '日本語'],
    ['Projekty/Alfa', 'Projekty/Alfa'],
  ])('decodes %s', (encoded, decoded) => {
    expect(decodeModifiedUtf7(encoded)).toBe(decoded);
  });
});

describe('Gmail label reading', () => {
  const labels = new Set(['\\Inbox', '"Fakt&APo-ry"', 'Projekty/Alfa', '']);

  it('returns null without the Gmail extension', () => {
    expect(toGmailLabels({ labels: false, utf8: false }, labels)).toBeNull();
  });

  it('decodes user labels, keeps system labels and drops empty values', () => {
    expect(toGmailLabels({ labels: true, utf8: false }, labels)).toEqual([
      'Faktúry',
      'Projekty/Alfa',
      '\\Inbox',
    ]);
    expect(toGmailLabels({ labels: true, utf8: false }, undefined)).toEqual([]);
  });

  it('leaves labels alone once UTF8=ACCEPT is enabled', () => {
    expect(toGmailLabels({ labels: true, utf8: true }, new Set(['Tom &- Jerry']))).toEqual([
      'Tom &- Jerry',
    ]);
  });
});

describe('mailbox roles', () => {
  const role = (path: string, flags: string[], labels: boolean) =>
    detectMailboxRole({ path, name: path, flags: new Set(flags), specialUse: null, labels });

  it('treats Flagged and Important folders as system folders', () => {
    expect(role('Starred', ['\\Flagged'], false)).toBe('system');
    expect(role('Important', ['\\Important'], true)).toBe('system');
  });

  it('uses folder names only outside the Gmail label mode', () => {
    expect(role('Archive', [], false)).toBe('archive');
    expect(role('Archive', [], true)).toBe('label');
    expect(role('Projekty', [], false)).toBe('custom');
    expect(role('INBOX', [], true)).toBe('inbox');
    expect(role('[Gmail]/All Mail', ['\\All'], true)).toBe('archive');
  });
});
