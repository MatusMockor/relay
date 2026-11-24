const CHARSET = /;\s*charset\s*=\s*"?([^";\s]+)"?/i;
const LEGACY_FALLBACK = 'windows-1250';

const BYTE_ORDER_MARKS: readonly (readonly [readonly number[], string])[] = [
  [[0xef, 0xbb, 0xbf], 'utf-8'],
  [[0xff, 0xfe], 'utf-16le'],
  [[0xfe, 0xff], 'utf-16be'],
];

const decoderFor = (label: string): TextDecoder | null => {
  try {
    return new TextDecoder(label);
  } catch {
    return null;
  }
};

const decodeUndeclared = (bytes: Uint8Array): string => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder(LEGACY_FALLBACK).decode(bytes);
  }
};

export const decodeText = (bytes: Uint8Array, contentType: string): string => {
  const bom = BYTE_ORDER_MARKS.find(([mark]) => mark.every((byte, index) => bytes[index] === byte));
  if (bom !== undefined) {
    const [mark, encoding] = bom;
    return new TextDecoder(encoding).decode(bytes.subarray(mark.length));
  }
  const declared = CHARSET.exec(contentType)?.[1];
  const decoder = declared === undefined ? null : decoderFor(declared);
  if (decoder === null) {
    return decodeUndeclared(bytes);
  }
  return decoder.decode(bytes);
};
