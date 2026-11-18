import { decodeModifiedUtf7, encodeShift } from './modified-utf7';

const ATOM_SPECIALS: ReadonlySet<string> = new Set(['(', ')', '{', '%', '*', '"', '\\', ']']);

const isAtomChar = (char: string): boolean =>
  char >= '!' && char <= '~' && !ATOM_SPECIALS.has(char);

const isAtom = (value: string): boolean => {
  for (const char of value) {
    if (!isAtomChar(char)) {
      return false;
    }
  }
  return value !== '';
};

const shiftEncoded = (value: string): string => {
  let encoded = '';
  let run = '';
  for (const char of value) {
    if (char !== '&' && isAtomChar(char)) {
      encoded += `${run === '' ? '' : encodeShift(run)}${char}`;
      run = '';
      continue;
    }
    if (char === '&') {
      encoded += `${run === '' ? '' : encodeShift(run)}&-`;
      run = '';
      continue;
    }
    run += char;
  }
  return run === '' ? encoded : `${encoded}${encodeShift(run)}`;
};

export const encodeKeyword = (name: string): string => {
  if (isAtom(name) && decodeModifiedUtf7(name) === name) {
    return name;
  }
  return shiftEncoded(name);
};

export const decodeKeyword = (keyword: string): string => {
  if (!keyword.includes('&')) {
    return keyword;
  }
  const decoded = decodeModifiedUtf7(keyword);
  return encodeKeyword(decoded) === keyword ? decoded : keyword;
};
