import { type AST, RegExpParser } from '@eslint-community/regexpp';
import { CharOverlap } from './regex-char-overlap';
import { exceedsAnalysisLimits } from './regex-limits';
import { edgeLoops } from './regex-loop-reach';
import {
  bodyChars,
  descendants,
  isAlternation,
  isCharAtom,
  isNullable,
  isRepeating,
  isVariable,
  sequenceStart,
} from './regex-structure';

export const MAX_MATCH_INPUT_LENGTH = 2_000;

const parser = new RegExpParser({ ecmaVersion: 2025 });

const parse = (pattern: string): AST.Pattern | null => {
  try {
    return parser.parsePattern(pattern, 0, pattern.length, { unicode: true });
  } catch {
    return null;
  }
};

const hasBackreference = (nodes: readonly AST.Node[]): boolean =>
  nodes.some((node) => node.type === 'Backreference');

const hasNestedVariableRepetition = (nodes: readonly AST.Node[]): boolean =>
  nodes.some((node) => isRepeating(node) && descendants(node.element).some(isVariable));

const isFixedCharRun = (node: AST.Element): boolean =>
  isCharAtom(node) ||
  (node.type === 'Quantifier' && node.min === node.max && isCharAtom(node.element));

const absorbing = (
  tails: readonly AST.Quantifier[],
  next: AST.Element,
  overlap: CharOverlap,
): AST.Quantifier[] => {
  if (!isFixedCharRun(next)) {
    return [];
  }
  return tails.filter(
    (tail) => isCharAtom(tail.element) && overlap.between(bodyChars(tail.element), bodyChars(next)),
  );
};

const overlapsLaterLoop = (
  tails: readonly AST.Quantifier[],
  rest: readonly AST.Element[],
  overlap: CharOverlap,
): boolean => {
  let open = tails;
  for (const next of rest) {
    if (open.length === 0) {
      return false;
    }
    const heads = edgeLoops(next, 'first');
    const overlapping = open.some((tail) =>
      heads.some((head) => overlap.between(bodyChars(tail.element), bodyChars(head.element))),
    );
    if (overlapping) {
      return true;
    }
    if (!isNullable(next)) {
      open = absorbing(open, next, overlap);
    }
  }
  return false;
};

const hasOverlappingNeighbours = (alternative: AST.Alternative, overlap: CharOverlap): boolean => {
  const elements = alternative.elements;
  return elements.some((element, index) =>
    overlapsLaterLoop(edgeLoops(element, 'last'), elements.slice(index + 1), overlap),
  );
};

const hasAmbiguousBranches = (
  alternatives: readonly AST.Alternative[],
  overlap: CharOverlap,
): boolean => {
  const starts = alternatives.map((alternative) => sequenceStart(alternative.elements));
  return starts.some(
    (start, index) =>
      start.nullable ||
      starts.slice(index + 1).some((other) => overlap.between(start.chars, other.chars)),
  );
};

const hasRepeatedAmbiguousAlternation = (
  nodes: readonly AST.Node[],
  overlap: CharOverlap,
): boolean =>
  nodes.some(
    (node) =>
      isRepeating(node) &&
      [node.element, ...descendants(node.element)].some(
        (inner) => isAlternation(inner) && hasAmbiguousBranches(inner.alternatives, overlap),
      ),
  );

export const isUnsafeRegex = (pattern: string): boolean => {
  if (exceedsAnalysisLimits(pattern)) {
    return true;
  }
  const ast = parse(pattern);
  if (ast === null) {
    return true;
  }
  const nodes = [ast, ...descendants(ast)];
  const overlap = new CharOverlap();
  return (
    hasBackreference(nodes) ||
    hasNestedVariableRepetition(nodes) ||
    hasRepeatedAmbiguousAlternation(nodes, overlap) ||
    nodes.some((node) => node.type === 'Alternative' && hasOverlappingNeighbours(node, overlap))
  );
};
