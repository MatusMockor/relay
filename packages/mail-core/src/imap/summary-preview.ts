import { buildSnippet } from '../parser/snippet';
import { decodeBodyCharset } from './charset-decoding';
import { decodeFlowed } from './flowed-text';
import type { PreviewPart } from './preview-part';
import { decodeTransfer } from './section-decoding';

export const PREVIEW_BYTES = 4096;

const completeBase64 = (raw: Buffer): Buffer => {
  const compact = raw.toString('latin1').replace(/[^A-Za-z0-9+/=]/g, '');
  return Buffer.from(compact.slice(0, compact.length - (compact.length % 4)), 'latin1');
};

const completeQuotedPrintable = (raw: Buffer): Buffer =>
  Buffer.from(raw.toString('latin1').replace(/=(?:\r|[0-9A-Fa-f])?$/, ''), 'latin1');

const completeEncoding = (raw: Buffer, encoding: string): Buffer => {
  if (encoding === 'base64') {
    return completeBase64(raw);
  }
  if (encoding === 'quoted-printable') {
    return completeQuotedPrintable(raw);
  }
  return raw;
};

const unflowed = (bytes: Buffer, preview: PreviewPart): Buffer => {
  if (!preview.flowed) {
    return bytes;
  }
  return Buffer.from(decodeFlowed(bytes.toString('latin1'), preview.delSp), 'latin1');
};

const decodedText = (raw: Buffer, preview: PreviewPart, truncated: boolean): string => {
  const encoded = truncated ? completeEncoding(raw, preview.encoding) : raw;
  const bytes = unflowed(decodeTransfer(encoded, preview.encoding), preview);
  const text = decodeBodyCharset(bytes, preview.charset);
  return truncated ? text.replace(/�+$/, '') : text;
};

export const previewSnippet = (raw: Buffer, preview: PreviewPart): string => {
  const truncated = raw.length >= PREVIEW_BYTES;
  const text = decodedText(raw.subarray(0, PREVIEW_BYTES), preview, truncated);
  if (preview.type === 'text/plain') {
    return buildSnippet(text, null);
  }
  return buildSnippet(null, text);
};
