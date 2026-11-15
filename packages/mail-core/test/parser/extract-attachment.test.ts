import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  composeMime,
  extractAttachment,
  MailparserAttachmentExtractor,
  MailparserMessageParser,
} from '../../src';
import { FixedClock } from '../support/infrastructure';
import { fixturePath } from '../support/raw-mail';

const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0xff]);
const csvBytes = new TextEncoder().encode('suma;splatnosť\n120;piatok\n');

const composed = () =>
  composeMime({
    from: { name: 'Jana', email: 'jana@klient.sk' },
    to: [{ name: null, email: 'jan@firma.sk' }],
    cc: [],
    bcc: [],
    subject: 'Faktúra',
    text: 'V prílohe.',
    html: null,
    inReplyTo: null,
    references: [],
    attachments: [
      { filename: 'faktúra.pdf', contentType: 'application/pdf', content: pdfBytes },
      { filename: 'rozpis.csv', contentType: 'text/csv', content: csvBytes },
    ],
  });

describe('extractAttachment', () => {
  it('returns the exact bytes in the same order as the parsed attachments', async () => {
    const { raw } = await composed();
    const source = new Uint8Array(raw);
    const parsed = await new MailparserMessageParser(new FixedClock(new Date())).parse(source);

    const first = await new MailparserAttachmentExtractor().extract(source, 0);
    const second = await extractAttachment(source, 1);

    expect(parsed.attachments.map((attachment) => attachment.filename)).toEqual([
      'faktúra.pdf',
      'rozpis.csv',
    ]);
    expect(first).toEqual({
      filename: 'faktúra.pdf',
      contentType: 'application/pdf',
      content: pdfBytes,
    });
    expect(second?.contentType).toBe('text/csv');
    expect(new TextDecoder().decode(second?.content)).toBe('suma;splatnosť\n120;piatok\n');
  });

  it('returns null for an index without an attachment', async () => {
    const { raw } = await composed();
    const source = new Uint8Array(raw);

    expect(await extractAttachment(source, 2)).toBeNull();
    expect(await extractAttachment(source, -1)).toBeNull();
    expect(await extractAttachment(source, 0.5)).toBeNull();
  });

  it('extracts attachments of a real Gmail message', async () => {
    const source = new Uint8Array(await readFile(fixturePath('gmail-reply.eml')));

    const attachment = await extractAttachment(source, 0);

    expect(attachment).toMatchObject({ filename: 'agenda.pdf', contentType: 'application/pdf' });
    expect(attachment?.content.byteLength).toBeGreaterThan(0);
  });
});
