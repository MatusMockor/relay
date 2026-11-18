const ATOM_SPECIALS: ReadonlySet<string> = new Set(['(', ')', '{', '%', '*', '"', '\\', ']']);
const SHIFTED = /&([0-9A-Fa-f]*)-/;

const isAtomChar = (char: string): boolean =>
  char >= '!' && char <= '~' && char !== '&' && !ATOM_SPECIALS.has(char);

const isAtom = (value: string): boolean => {
  for (const char of value) {
    if (!isAtomChar(char)) {
      return false;
    }
  }
  return value !== '';
};

const shift = (run: string): string => {
  if (run === '') {
    return '';
  }
  const bytes = new TextEncoder().encode(run);
  return `&${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}-`;
};

const unshift = (hex: string): string | null => {
  if (hex === '' || hex.length % 2 !== 0) {
    return null;
  }
  const bytes = Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

export const keywordKey = (keyword: string): string => keyword.toLowerCase();

export const encodeKeyword = (name: string): string => {
  if (isAtom(name)) {
    return name;
  }
  let encoded = '';
  let run = '';
  for (const char of name) {
    if (!isAtomChar(char)) {
      run = `${run}${char}`;
      continue;
    }
    encoded += `${shift(run)}${char}`;
    run = '';
  }
  return `${encoded}${shift(run)}`;
};

export const decodeKeyword = (keyword: string): string => {
  if (!keyword.includes('&')) {
    return keyword;
  }
  const parts = keyword
    .split(SHIFTED)
    .map((part, index) => (index % 2 === 0 ? part : unshift(part)));
  if (parts.some((part) => part === null)) {
    return keyword;
  }
  const decoded = parts.join('');
  return keywordKey(encodeKeyword(decoded)) === keywordKey(keyword) ? decoded : keyword;
};
