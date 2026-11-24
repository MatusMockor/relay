const DOCUMENT_START =
  /^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\s+html\b|<html[\s>])/i;

const STRUCTURAL_START = /^<(?:head|body|table|div|p|meta|style|center)[\s>/]/i;

const STRUCTURAL_CLOSE = /<\/(?:html|head|body|table|div|p)\s*>/i;

export const looksLikeHtml = (text: string): boolean => {
  const trimmed = text.trim();
  if (DOCUMENT_START.test(trimmed)) {
    return true;
  }
  return STRUCTURAL_START.test(trimmed) && STRUCTURAL_CLOSE.test(trimmed);
};
