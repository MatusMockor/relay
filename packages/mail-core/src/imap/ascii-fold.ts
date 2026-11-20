const COMBINING_MARKS = /\p{M}/gu;

export const asciiFold = (term: string): string =>
  term.normalize('NFD').replace(COMBINING_MARKS, '').normalize('NFC');
