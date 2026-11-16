import { MAX_CALENDAR_PART_BYTES } from '../parser/calendar-part-rules';
import type { CalendarSection } from './calendar-sections';

const decodeQuotedPrintable = (raw: Buffer): Buffer => {
  const text = raw.toString('latin1').replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const hex = text.slice(index + 1, index + 3);
    if (text[index] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
      continue;
    }
    bytes.push(text.charCodeAt(index));
  }
  return Buffer.from(bytes);
};

const decodeTransfer = (raw: Buffer, encoding: string): Buffer => {
  if (encoding === 'base64') {
    return Buffer.from(raw.toString('latin1'), 'base64');
  }
  if (encoding === 'quoted-printable') {
    return decodeQuotedPrintable(raw);
  }
  return raw;
};

const decodeCharset = (bytes: Buffer, charset: string): string => {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return bytes.toString('utf8');
  }
};

export const decodeSection = (raw: Buffer, section: CalendarSection): string | null => {
  const bytes = decodeTransfer(raw, section.encoding);
  if (bytes.length > MAX_CALENDAR_PART_BYTES) {
    return null;
  }
  return decodeCharset(bytes, section.charset);
};
