import type { AttachmentMeta } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import {
  badgeOf,
  badgeToneOf,
  previewKindOf,
  previewTypeOf,
} from '../src/features/attachments/attachment-kind';

const attachment = (filename: string | null, contentType: string, size = 100): AttachmentMeta =>
  ({ id: 'att-1', filename, contentType, size, contentId: null, inline: false }) as AttachmentMeta;

describe('attachment kinds and badges', () => {
  it('names the type from the extension first and from the content type otherwise', () => {
    expect(badgeOf(attachment('faktura.pdf', 'application/octet-stream'))).toBe('PDF');
    expect(badgeOf(attachment('foto.jpeg', 'image/jpeg'))).toBe('JPG');
    expect(badgeOf(attachment(null, 'application/vnd.ms-excel'))).toBe('XLS');
    expect(badgeOf(attachment('archiv.tar.gzipped', 'application/x-unknown'))).toBe('SÚBOR');
  });

  it('never reads inherited object keys from hostile content types or extensions', () => {
    const hostile = [
      attachment(null, '__proto__'),
      attachment(null, 'constructor'),
      attachment('subor.constructor', 'toString'),
      attachment('subor.valueof', 'hasOwnProperty'),
    ];

    expect(hostile.map((item) => badgeOf(item))).toEqual(['SÚBOR', 'SÚBOR', 'SÚBOR', 'SÚBOR']);
    expect(hostile.map((item) => previewKindOf(item))).toEqual(['file', 'file', 'file', 'file']);
    expect(hostile.map((item) => badgeToneOf(item))).toEqual(['plain', 'plain', 'plain', 'plain']);
  });

  it('previews only PDFs, safe raster images and small plain text', () => {
    expect(previewTypeOf(attachment('a.pdf', 'application/octet-stream'))).toBe('application/pdf');
    expect(previewTypeOf(attachment('a.png', 'application/octet-stream'))).toBe('image/png');
    expect(previewTypeOf(attachment('a.svg', 'image/svg+xml'))).toBeNull();
    expect(previewTypeOf(attachment('a.txt', 'text/plain; charset=utf-8'))).toBe('text/plain');
    expect(previewTypeOf(attachment('a.txt', 'text/plain', 2 * 1024 * 1024))).toBeNull();
  });
});
