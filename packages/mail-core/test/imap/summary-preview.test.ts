import { describe, expect, it } from 'vitest';
import { stripTraceHeaders } from '../../src/parser/trace-headers';
import { PREVIEW_BYTES, previewSnippet } from '../../src/imap/summary-preview';
import type { PreviewPart } from '../../src/imap/summary-structure';

const part = (encoding: string, charset = 'utf-8'): PreviewPart => ({
  part: '1',
  type: 'text/plain',
  encoding,
  charset,
});

const truncatedQuotedPrintable = (): Buffer => {
  const head = '=C4=8Eakujem ';
  return Buffer.from(`${head}${' '.repeat(PREVIEW_BYTES - head.length - 8)}koniec=C`, 'latin1');
};

describe('summary preview decoding', () => {
  it('drops a dangling quoted-printable escape of a truncated part', () => {
    const snippet = previewSnippet(truncatedQuotedPrintable(), part('quoted-printable'));

    expect(snippet).toBe('Ďakujem koniec');
    expect(
      previewSnippet(Buffer.from('Pros=C3=ADm=\r\n o podpis=C'), part('quoted-printable')),
    ).toBe('Prosím o podpis=C');
  });

  it('decodes a truncated base64 part without a partial character', () => {
    const text = `Ľubo${' '.repeat(3066)}${'ť'.repeat(100)}`;
    const raw = Buffer.from(Buffer.from(text).toString('base64')).subarray(0, PREVIEW_BYTES);

    expect(previewSnippet(raw, part('base64'))).toBe('Ľubo');
  });

  it('keeps the header block without folded trace headers', () => {
    const header = Buffer.from(
      'Received: from a\r\n\tby b\r\nSubject: Ahoj\r\n svet\r\nDKIM-Signature: v=1;\r\n b=x\r\n',
    );

    expect(stripTraceHeaders(header).toString()).toBe('Subject: Ahoj\r\n svet\r\n\r\n');
    expect(stripTraceHeaders(Buffer.alloc(0)).toString()).toBe('\r\n');
  });
});
