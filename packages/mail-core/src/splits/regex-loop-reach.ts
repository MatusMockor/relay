import type { AST } from '@eslint-community/regexpp';
import { isLoop, isNullable } from './regex-structure';

type Edge = 'first' | 'last';

const ordered = (elements: readonly AST.Element[], edge: Edge): AST.Element[] =>
  edge === 'first' ? [...elements] : [...elements].reverse();

const sequenceLoops = (elements: readonly AST.Element[], edge: Edge): AST.Quantifier[] => {
  const loops: AST.Quantifier[] = [];
  for (const element of ordered(elements, edge)) {
    loops.push(...edgeLoops(element, edge));
    if (!isNullable(element)) {
      return loops;
    }
  }
  return loops;
};

export const edgeLoops = (node: AST.Element, edge: Edge): AST.Quantifier[] => {
  if (node.type === 'Quantifier') {
    const inner = node.element;
    return isLoop(node) ? [node] : edgeLoops(inner, edge);
  }
  if (node.type === 'Group' || node.type === 'CapturingGroup') {
    return node.alternatives.flatMap((alternative) => sequenceLoops(alternative.elements, edge));
  }
  return [];
};
