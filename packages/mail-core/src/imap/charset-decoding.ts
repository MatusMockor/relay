import iconv from 'iconv-lite';

const UNDECODED_CHARSETS = new Set(['ascii', 'usascii', 'utf8']);

const compactCharset = (charset: string): string =>
  charset.toLowerCase().replace(/[^a-z0-9]+/g, '');

const decodeWithPlatform = (bytes: Buffer, charset: string): string => {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return bytes.toString('utf8');
  }
};

export const decodeBodyCharset = (bytes: Buffer, charset: string): string => {
  const name = charset.trim().toLowerCase();
  if (UNDECODED_CHARSETS.has(compactCharset(name))) {
    return bytes.toString('utf8');
  }
  if (!iconv.encodingExists(name)) {
    return decodeWithPlatform(bytes, name);
  }
  return iconv.decode(bytes, name);
};
