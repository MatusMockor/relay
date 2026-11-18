import { parseSrcset, type SrcsetCandidate } from './srcset';

const PERMITTED_URL_PATTERN = /^\s*(?:data|cid):/i;
const WIDTH_PATTERN = /^(\d+)w$/;
const DENSITY_PATTERN = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?x$/;
const SUPPORTED_TYPES = new Set([
  'image/apng',
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'image/x-icon',
]);

const isValidDescriptor = (descriptor: string): boolean => {
  if (descriptor === '' || DENSITY_PATTERN.test(descriptor)) {
    return true;
  }
  return Number(WIDTH_PATTERN.exec(descriptor)?.[1] ?? 0) > 0;
};

const isSelectable = (candidate: SrcsetCandidate): boolean =>
  PERMITTED_URL_PATTERN.test(candidate.url) && isValidDescriptor(candidate.descriptor);

export const selectableCandidates = (element: Element): number =>
  parseSrcset(element.getAttribute('srcset') ?? '').filter(isSelectable).length;

const hasSupportedType = (source: Element): boolean => {
  const type = (source.getAttribute('type') ?? '').trim().toLowerCase();
  return type === '' || SUPPORTED_TYPES.has(type);
};

export const hasSelectableSource = (image: Element): boolean => {
  const picture = image.parentElement;
  if (picture?.tagName !== 'PICTURE') {
    return false;
  }
  return [...picture.querySelectorAll(':scope > source')].some(
    (source) => hasSupportedType(source) && selectableCandidates(source) > 0,
  );
};
