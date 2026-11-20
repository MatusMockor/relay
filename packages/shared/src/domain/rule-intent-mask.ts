export interface MaskedSentence {
  readonly text: string;
  readonly addresses: readonly string[];
  readonly quotes: readonly string[];
}

const BRACKETED = /<\s*([^\s<>]+@[^\s<>]+?)\s*>/gu;
const ADDRESS = /[^\s<>()[\],;:"'„“”]+@[^\s<>()[\],;:"'„“”]+/gu;
const QUOTED = /„[^“”"]*[“”"]|"[^"]*"|“[^”]*”/gu;
const QUOTE_SLOT = /^§q(\d+)§$/u;

export const fold = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('sk');

export const maskSentence = (sentence: string): MaskedSentence => {
  const addresses: string[] = [];
  const quotes: string[] = [];
  const text = sentence
    .replace(BRACKETED, ' $1 ')
    .replace(ADDRESS, (match) => {
      const address = match.replace(/[.!?]+$/u, '');
      addresses.push(address.toLowerCase());
      return ` §${String(addresses.length - 1)}§ ${match.slice(address.length)}`;
    })
    .replace(QUOTED, (match) => {
      quotes.push(fold(match.slice(1, -1)));
      return ` §q${String(quotes.length - 1)}§ `;
    });
  return { text: fold(text), addresses, quotes };
};

export const unquoted = (token: string, quotes: readonly string[]): string => {
  const slot = QUOTE_SLOT.exec(token);
  return slot === null ? token : (quotes[Number(slot[1])] ?? '');
};
