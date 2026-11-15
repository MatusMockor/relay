const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

export const isSafeExternalUrl = (url: string): boolean => {
  if (!URL.canParse(url)) {
    return false;
  }
  return EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
};
