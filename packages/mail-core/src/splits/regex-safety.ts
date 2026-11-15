import { type AST, RegExpParser } from '@eslint-community/regexpp';
import { CharOverlap } from './regex-char-overlap';
import {
  bodyChars,
  descendants,
  isAlternation,
  isLoop,
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

const flattened = (elements: readonly AST.Element[]): AST.Element[] =>
  elements.flatMap((element) => {
    const [only, ...rest] =
      element.type === 'Group' || element.type === 'CapturingGroup' ? element.alternatives : [];
    return only !== undefined && rest.length === 0 ? flattened(only.elements) : [element];
  });

const followingLoops = (elements: readonly AST.Element[], from: number): AST.Quantifier[] => {
  const loops: AST.Quantifier[] = [];
  for (const element of elements.slice(from + 1)) {
    if (isLoop(element)) {
      loops.push(element);
    }
    if (!isNullable(element)) {
      return loops;
    }
  }
  return loops;
};

const hasOverlappingNeighbours = (alternative: AST.Alternative, overlap: CharOverlap): boolean => {
  const elements = flattened(alternative.elements);
  return elements.some(
    (element, index) =>
      isLoop(element) &&
      followingLoops(elements, index).some((next) =>
        overlap.between(bodyChars(element.element), bodyChars(next.element)),
      ),
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
