import iconv from 'iconv-lite';

const UNDECODED_CHARSETS = new Set(['ascii', 'usascii', 'utf8']);

const compactCharset = (charset: string): string =>
  charset.toLowerCase().replace(/[^a-z0-9]+/g, '');

export const decodeBodyCharset = (bytes: Buffer, charset: string): string => {
  const name = charset.trim().toLowerCase();
  if (UNDECODED_CHARSETS.has(compactCharset(name)) || !iconv.encodingExists(name)) {
    return bytes.toString('utf8');
  }
  return iconv.decode(bytes, name);
};
