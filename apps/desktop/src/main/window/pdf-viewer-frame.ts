const PDF_VIEWER_EXTENSION = 'mhjfbmdgcfjbbpaeojofohoefgiehjai';

export const isPdfViewerUrl = (url: string): boolean => {
  if (!URL.canParse(url)) {
    return false;
  }
  const parsed = new URL(url);
  return parsed.protocol === 'chrome-extension:' && parsed.host === PDF_VIEWER_EXTENSION;
};
