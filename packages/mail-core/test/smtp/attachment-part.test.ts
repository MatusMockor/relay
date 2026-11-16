import type { OutgoingMessage } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import { extractAttachment } from '../../src/parser/extract-attachment';
import { composeMime } from '../../src/smtp/compose-mime';

const message = (filename: string, contentType = 'application/pdf'): OutgoingMessage => ({
  from: { name: 'Matúš', email: 'matus@relay.test' },
  to: [{ name: null, email: 'jana@relay.test' }],
  cc: [],
  bcc: [],
  subject: 'Príloha',
  text: 'V prílohe.',
  html: null,
  inReplyTo: null,
  references: [],
  attachments: [{ filename, contentType, content: new Uint8Array([0x25, 0x00, 0xff, 0x0a]) }],
});

describe('attachment MIME parts', () => {
  it.each([
    'a b.txt',
    'cenová ponuka č. 7.pdf',
    'rozpočet ľščť 2027.xlsx',
    'dlhý názov súboru s medzerami a diakritikou ľščťžýáíé 2027 final verzia.pdf',
    `${'ž'.repeat(120)} koniec.pdf`,
    'zmluva "finál"; (kópia).pdf',
  ])('keeps the filename %s byte for byte through compose and parse', async (filename) => {
    const { raw } = await composeMime(message(filename));

    expect(await extractAttachment(raw, 0)).toEqual({
      filename,
      contentType: 'application/pdf',
      content: new Uint8Array([0x25, 0x00, 0xff, 0x0a]),
    });
    const lines = raw.toString('latin1').split('\r\n');
    expect(lines.every((line) => line.length <= 998)).toBe(true);
  });

  it('never lets a content type inject headers', async () => {
    const { raw } = await composeMime(message('priloha', 'text/plain\r\nBcc: spy@evil.test'));

    const text = raw.toString('latin1');
    expect(text).not.toContain('spy@evil.test');
    expect((await extractAttachment(raw, 0))?.contentType).toBe('application/octet-stream');
  });

  it('sends message and multipart types as opaque files because they cannot be base64 encoded', async () => {
    const { raw } = await composeMime(message('preposlaná.eml', 'message/rfc822'));

    expect(raw.toString('latin1')).toMatch(/Content-Type: application\/octet-stream;/);
    expect((await extractAttachment(raw, 0))?.filename).toBe('preposlaná.eml');
  });
});
