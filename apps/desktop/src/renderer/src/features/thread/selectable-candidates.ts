import { parseSrcset, type SrcsetCandidate } from './srcset';

const PERMITTED_URL_PATTERN = /^\s*(?:data|cid):/i;

const isUnselectableToken = (token: string): boolean => {
  const value = Number(token.slice(0, -1));
  if (token.endsWith('w')) {
    return value <= 0;
  }
  return token.endsWith('x') && value === 0;
};

const isSelectable = (candidate: SrcsetCandidate): boolean =>
  PERMITTED_URL_PATTERN.test(candidate.url) &&
  !candidate.descriptor.split(/\s+/).some(isUnselectableToken);

export const selectableCandidates = (element: Element): number =>
  parseSrcset(element.getAttribute('srcset') ?? '').filter(isSelectable).length;

export const hasSelectableSource = (image: Element): boolean => {
  const picture = image.parentElement;
  if (picture?.tagName !== 'PICTURE') {
    return false;
  }
  return [...picture.querySelectorAll(':scope > source')].some(
    (source) => selectableCandidates(source) > 0,
  );
};
