import type { AST } from '@eslint-community/regexpp';
import { type CharAtom, type CharSet, unionChars } from './regex-char-overlap';

export interface StartChars {
  readonly chars: CharSet;
  readonly nullable: boolean;
}

type Branching = AST.Pattern | AST.Group | AST.CapturingGroup | AST.LookaroundAssertion;

const isBranching = (node: AST.Node): node is Branching =>
  node.type === 'Pattern' ||
  node.type === 'Group' ||
  node.type === 'CapturingGroup' ||
  (node.type === 'Assertion' && 'alternatives' in node);

export const children = (node: AST.Node): AST.Node[] => {
  if (isBranching(node)) {
    return node.alternatives;
  }
  if (node.type === 'Alternative') {
    return node.elements;
  }
  if (node.type === 'Quantifier') {
    return [node.element];
  }
  return [];
};

export const descendants = (node: AST.Node): AST.Node[] =>
  children(node).flatMap((child) => [child, ...descendants(child)]);

export const isRepeating = (node: AST.Node): node is AST.Quantifier =>
  node.type === 'Quantifier' && node.max > 1;

export const isVariable = (node: AST.Node): node is AST.Quantifier =>
  node.type === 'Quantifier' && node.min !== node.max;

export const isLoop = (node: AST.Node): node is AST.Quantifier =>
  isRepeating(node) && isVariable(node);

export const isAlternation = (node: AST.Node): node is Branching =>
  isBranching(node) && node.alternatives.length > 1;

const charAtom = (node: AST.Node): CharAtom => ({
  source: node.raw,
  literal: node.type === 'Character' ? String.fromCodePoint(node.value) : null,
});

const isCharAtom = (node: AST.Node): boolean =>
  node.type === 'Character' ||
  node.type === 'CharacterSet' ||
  node.type === 'CharacterClass' ||
  node.type === 'ExpressionCharacterClass';

export const bodyChars = (node: AST.Node): CharSet => {
  if (node.type === 'Backreference') {
    return 'any';
  }
  if (isCharAtom(node)) {
    return [charAtom(node)];
  }
  return children(node).map(bodyChars).reduce(unionChars, []);
};

export const sequenceStart = (elements: readonly AST.Node[]): StartChars => {
  let chars: CharSet = [];
  for (const element of elements) {
    const start = elementStart(element);
    chars = unionChars(chars, start.chars);
    if (!start.nullable) {
      return { chars, nullable: false };
    }
  }
  return { chars, nullable: true };
};

const elementStart = (node: AST.Node): StartChars => {
  if (isCharAtom(node)) {
    return { chars: [charAtom(node)], nullable: false };
  }
  if (node.type === 'Backreference') {
    return { chars: 'any', nullable: true };
  }
  if (node.type === 'Assertion') {
    return { chars: [], nullable: true };
  }
  if (node.type === 'Quantifier') {
    const start = elementStart(node.element);
    return { chars: start.chars, nullable: start.nullable || node.min === 0 };
  }
  const starts = children(node).map((child) =>
    child.type === 'Alternative' ? sequenceStart(child.elements) : elementStart(child),
  );
  return {
    chars: starts.map((start) => start.chars).reduce(unionChars, []),
    nullable: starts.length === 0 || starts.some((start) => start.nullable),
  };
};

export const isNullable = (node: AST.Node): boolean => elementStart(node).nullable;
