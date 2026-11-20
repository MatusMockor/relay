export interface NamedTarget {
  readonly id: string;
  readonly name: string;
}

const EDGE_PUNCTUATION = /^["'„“”‚‘’«»]+|["'„“”‚‘’«».,;:!?]+$/gu;
const MIN_STEM = 4;
const STEM_SLACK = 2;

export const foldName = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('sk').replace(/\s+/g, ' ').trim();

const segmentsOf = (name: string): string[] =>
  name
    .replace(EDGE_PUNCTUATION, '')
    .split('/')
    .map(foldName)
    .filter((segment) => segment !== '');

const pathOf = (name: string): string => segmentsOf(name).join('/');

const leafOf = (name: string): string => segmentsOf(name).at(-1) ?? '';

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

const single = <Target>(matches: readonly Target[]): Target | null =>
  matches.length === 1 ? (matches[0] ?? null) : null;

export const findTarget = <Target extends NamedTarget>(
  targets: readonly Target[],
  query: string,
): Target | null => {
  const path = pathOf(query);
  if (path === '') {
    return null;
  }
  const exact = targets.find((target) => pathOf(target.name) === path);
  if (exact !== undefined) {
    return exact;
  }
  const leaf = leafOf(query);
  const byLeaf = single(targets.filter((target) => leafOf(target.name) === leaf));
  if (byLeaf !== null) {
    return byLeaf;
  }
  return single(targets.filter((target) => sameStem(leafOf(target.name), leaf)));
};
