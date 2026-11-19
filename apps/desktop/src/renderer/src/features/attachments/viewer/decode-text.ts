const CHARSET = /;\s*charset\s*=\s*"?([^";\s]+)"?/i;
const FALLBACK_CHARSET = 'utf-8';

const decoderFor = (label: string): TextDecoder => {
  try {
    return new TextDecoder(label);
  } catch {
    return new TextDecoder(FALLBACK_CHARSET);
  }
};

export const decodeText = (bytes: Uint8Array, contentType: string): string =>
  decoderFor(CHARSET.exec(contentType)?.[1] ?? FALLBACK_CHARSET).decode(bytes);
