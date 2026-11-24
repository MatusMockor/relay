const PROLOG_DELIMITERS: readonly (readonly [string, string])[] = [
  ['<?xml', '?>'],
  ['<!--', '-->'],
];

const DOCTYPE = /^<!doctype\s+html\b/i;

const HTML_ROOT = /^<html[\s>]/i;

const DOCUMENT_SECTION_END = /<\/(?:head|body)\s*>/i;

const HTML_END = /<\/html\s*>$/i;

const BODY_START = /<body(?:\s[^<>]*)?>/i;

const CLOSED_BLOCK = /<\/(?:p|div|table|td)\s*>/i;

const STRUCTURAL_START = /^<(?:head|body|table|div|p|meta|style|center)[\s>/]/i;

const STRUCTURAL_END = /<\/(?:html|body|table|div|p)\s*>$/i;

const skipPrologItem = (text: string): string | null => {
  const lower = text.slice(0, 5).toLowerCase();
  const delimiters = PROLOG_DELIMITERS.find(([open]) => lower.startsWith(open));
  if (delimiters === undefined) {
    return null;
  }
  const end = text.indexOf(delimiters[1]);
  if (end === -1) {
    return null;
  }
  return text.slice(end + delimiters[1].length).trimStart();
};

const withoutProlog = (text: string): string => {
  let rest = text;
  for (;;) {
    const next = skipPrologItem(rest);
    if (next === null) {
      return rest;
    }
    rest = next;
  }
};

const isDocument = (text: string): boolean => {
  if (DOCTYPE.test(text)) {
    return true;
  }
  if (!HTML_ROOT.test(text)) {
    return false;
  }
  if (DOCUMENT_SECTION_END.test(text) || HTML_END.test(text)) {
    return true;
  }
  return BODY_START.test(text) && CLOSED_BLOCK.test(text);
};

export const looksLikeHtml = (text: string): boolean => {
  const content = withoutProlog(text.trim());
  if (isDocument(content)) {
    return true;
  }
  return STRUCTURAL_START.test(content) && STRUCTURAL_END.test(content);
};
