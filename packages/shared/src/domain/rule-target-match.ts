export interface NamedTarget {
  readonly id: string;
  readonly name: string;
}

export type TargetMatch<Target> =
  | { readonly kind: 'found'; readonly target: Target }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'none' };

const EDGE_PUNCTUATION = /^["'„“”‚‘’«»]+|["'„“”‚‘’«».,;:!?]+$/gu;
const WORD_BREAK = /[^\p{L}\p{N}]+/u;
const MIN_STEM = 4;
const STEM_SLACK = 2;
const NONE = { kind: 'none' } as const;
const AMBIGUOUS = { kind: 'ambiguous' } as const;

export const foldName = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('sk').replace(/\s+/g, ' ').trim();

const segmentsOf = (name: string): string[] =>
  name
    .replace(EDGE_PUNCTUATION, '')
    .split('/')
    .map(foldName)
    .filter((segment) => segment !== '');

const pathOf = (name: string): string => segmentsOf(name).join('/');

const parentOf = (name: string): string => segmentsOf(name).slice(0, -1).join('/');

const leafOf = (name: string): string => segmentsOf(name).at(-1) ?? '';

const endsWithPath = (path: string, tail: string): boolean =>
  path === tail || path.endsWith(`/${tail}`);

const commonPrefix = (left: string, right: string): number => {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) {
    index += 1;
  }
  return index;
};

const sameStem = (left: string, right: string): boolean => {
  if (left.length < MIN_STEM || right.length < MIN_STEM) {
    return false;
  }
  const needed = Math.max(MIN_STEM, Math.max(left.length, right.length) - STEM_SLACK);
  return commonPrefix(left, right) >= needed;
};

const decided = <Target>(matches: readonly Target[]): TargetMatch<Target> | null => {
  const [first] = matches;
  if (first === undefined) {
    return null;
  }
  return matches.length === 1 ? { kind: 'found', target: first } : AMBIGUOUS;
};

const qualifiedMatch = <Target extends NamedTarget>(
  targets: readonly Target[],
  query: string,
): TargetMatch<Target> => {
  const parent = parentOf(query);
  const leaf = leafOf(query);
  const siblings = targets.filter((target) => endsWithPath(parentOf(target.name), parent));
  return decided(siblings.filter((target) => sameStem(leafOf(target.name), leaf))) ?? NONE;
};

export const findTarget = <Target extends NamedTarget>(
  targets: readonly Target[],
  query: string,
): TargetMatch<Target> => {
  const path = pathOf(query);
  if (path === '') {
    return NONE;
  }
  const exact = decided(targets.filter((target) => endsWithPath(pathOf(target.name), path)));
  if (exact !== null) {
    return exact;
  }
  if (segmentsOf(query).length > 1) {
    return qualifiedMatch(targets, query);
  }
  const leaf = leafOf(query);
  return decided(targets.filter((target) => sameStem(leafOf(target.name), leaf))) ?? NONE;
};

export const mentionsName = (sentence: string, name: string): boolean => {
  const words = foldName(sentence).split(WORD_BREAK);
  const wanted = leafOf(name)
    .split(WORD_BREAK)
    .filter((word) => word !== '');
  return (
    wanted.length > 0 &&
    wanted.every((word) => words.some((said) => said === word || sameStem(said, word)))
  );
};
