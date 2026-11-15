export interface CharAtom {
  readonly source: string;
  readonly literal: string | null;
}

export type CharSet = readonly CharAtom[] | 'any';

const SAMPLE_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x024f],
  [0x0370, 0x052f],
  [0x1e00, 0x1eff],
  [0x2000, 0x214f],
  [0x3000, 0x303f],
  [0x4e00, 0x4e3f],
  [0xfeff, 0xfeff],
  [0xff00, 0xff5f],
  [0x1f300, 0x1f64f],
];

const MAX_CODE_POINT = 0x10ffff;
const SURROGATES = { from: 0xd800, to: 0xdfff } as const;
const MAX_EXHAUSTIVE_CHECKS = 8;

const SAMPLES: readonly string[] = SAMPLE_RANGES.flatMap(([from, to]) =>
  Array.from({ length: to - from + 1 }, (_, offset) => String.fromCodePoint(from + offset)),
);

const exactly = (source: string): RegExp => new RegExp(`^(?:${source})$`, 'iu');

const anyCodePointMatches = (regex: RegExp): boolean => {
  for (let codePoint = 0; codePoint <= MAX_CODE_POINT; codePoint += 1) {
    if (codePoint === SURROGATES.from) {
      codePoint = SURROGATES.to;
      continue;
    }
    if (regex.test(String.fromCodePoint(codePoint))) {
      return true;
    }
  }
  return false;
};

export const unionChars = (left: CharSet, right: CharSet): CharSet => {
  if (left === 'any' || right === 'any') {
    return 'any';
  }
  return [...left, ...right];
};

const isEmpty = (set: CharSet): boolean => set !== 'any' && set.length === 0;

export class CharOverlap {
  private exhaustiveChecks = 0;

  between(left: CharSet, right: CharSet): boolean {
    if (isEmpty(left) || isEmpty(right)) {
      return false;
    }
    if (left === 'any' || right === 'any') {
      return true;
    }
    return left.some((atom) => right.some((other) => this.atoms(atom, other)));
  }

  private atoms(left: CharAtom, right: CharAtom): boolean {
    if (left.literal !== null) {
      return exactly(right.source).test(left.literal);
    }
    if (right.literal !== null) {
      return exactly(left.source).test(right.literal);
    }
    const both = exactly(`(?=(?:${left.source})$)(?:${right.source})`);
    if (SAMPLES.some((sample) => both.test(sample))) {
      return true;
    }
    if (this.exhaustiveChecks >= MAX_EXHAUSTIVE_CHECKS) {
      return true;
    }
    this.exhaustiveChecks += 1;
    return anyCodePointMatches(both);
  }
}
