import type { SplitOverlap } from '@relay/shared';
import { plural } from '../../../lib/text';

const mails = (count: number): string =>
  `${String(count)} ${plural(count, 'mail', 'maily', 'mailov')}`;

export const overlapLine = (overlap: SplitOverlap): string => {
  if (overlap.kind === 'split') {
    return `${mails(overlap.count)} zachytí aj split ${overlap.name}, ktorý je vyššie.`;
  }
  const them = overlap.count === 1 ? 'ho' : 'ich';
  return `${mails(overlap.count)} archivuje alebo presunie automatizácia ${overlap.name}, v splite ${them} neuvidíš.`;
};
