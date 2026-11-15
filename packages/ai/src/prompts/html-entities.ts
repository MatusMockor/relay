const NAMED: Readonly<Record<string, string>> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const REFERENCE = /&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([a-zA-Z]{2,8}));/g;
const REPLACEMENT_CHARACTER = '�';

export function decodeHtmlEntities(text: string): string {
  return text.replace(
    REFERENCE,
    (
      entity: string,
      hex: string | undefined,
      decimal: string | undefined,
      name: string | undefined,
    ) => {
      if (hex !== undefined) {
        return fromCodePoint(Number.parseInt(hex, 16));
      }
      if (decimal !== undefined) {
        return fromCodePoint(Number.parseInt(decimal, 10));
      }
      return NAMED[name ?? ''] ?? entity;
    },
  );
}

function fromCodePoint(codePoint: number): string {
  if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return REPLACEMENT_CHARACTER;
  }
  return String.fromCodePoint(codePoint);
}
