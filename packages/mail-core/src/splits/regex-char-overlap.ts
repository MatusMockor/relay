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
  [0xd800, 0xd800],
  [0xdbff, 0xdc00],
  [0xdfff, 0xdfff],
  [0xfeff, 0xfeff],
  [0xff00, 0xff5f],
  [0x1f300, 0x1f64f],
];

const MAX_CODE_POINT = 0x10ffff;
const MAX_EXHAUSTIVE_CHECKS = 8;
const MAX_ANALYSIS_WORK = 5_000;
const LITERAL_WORK = 1;
const SAMPLED_WORK = 25;

const SAMPLES: readonly string[] = SAMPLE_RANGES.flatMap(([from, to]) =>
  Array.from({ length: to - from + 1 }, (_, offset) => String.fromCodePoint(from + offset)),
);

const RULE_FLAGS = ['iu', 'u'] as const;

const exactly = (source: string): RegExp[] =>
  RULE_FLAGS.map((flags) => new RegExp(`^(?:${source})$`, flags));

const anyTests = (regexes: readonly RegExp[], text: string): boolean =>
  regexes.some((regex) => regex.test(text));

const anyCodePointMatches = (regexes: readonly RegExp[]): boolean => {
  for (let codePoint = 0; codePoint <= MAX_CODE_POINT; codePoint += 1) {
    if (anyTests(regexes, String.fromCodePoint(codePoint))) {
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
  private work = 0;
  private readonly compiled = new Map<string, RegExp[]>();

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
      return this.spend(LITERAL_WORK) || anyTests(this.exactly(right.source), left.literal);
    }
    if (right.literal !== null) {
      return this.spend(LITERAL_WORK) || anyTests(this.exactly(left.source), right.literal);
    }
    if (this.spend(SAMPLED_WORK)) {
      return true;
    }
    const both = exactly(`(?=(?:${left.source})$)(?:${right.source})`);
    if (SAMPLES.some((sample) => anyTests(both, sample))) {
      return true;
    }
    if (this.exhaustiveChecks >= MAX_EXHAUSTIVE_CHECKS) {
      return true;
    }
    this.exhaustiveChecks += 1;
    return anyCodePointMatches(both);
  }

  private spend(amount: number): boolean {
    this.work += amount;
    return this.work > MAX_ANALYSIS_WORK;
  }

  private exactly(source: string): RegExp[] {
    const known = this.compiled.get(source);
    if (known !== undefined) {
      return known;
    }
    const regexes = exactly(source);
    this.compiled.set(source, regexes);
    return regexes;
  }
}
