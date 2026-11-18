import { hasSelectableSource, selectableCandidates } from './selectable-candidates';
import { isRemoteUrl, parseSrcset, serializeSrcset } from './srcset';

const MAX_SIDE = 4_000;

const dimensionOf = (image: Element, name: 'width' | 'height'): number | null => {
  const match = /^\s*(\d{1,5})/.exec(image.getAttribute(name) ?? '');
  const value = match?.[1] === undefined ? Number.NaN : Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.min(value, MAX_SIDE);
};

export const placeholderImage = (width: number, height: number): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"/>`,
  )}`;

const EMPTY_IMAGE = placeholderImage(1, 1);

const stripRemoteCandidates = (element: Element): { removed: boolean; local: number } => {
  const srcset = element.getAttribute('srcset');
  if (srcset === null) {
    return { removed: false, local: 0 };
  }
  const candidates = parseSrcset(srcset);
  const local = candidates.filter((candidate) => !isRemoteUrl(candidate.url));
  if (local.length === candidates.length) {
    return { removed: false, local: local.length };
  }
  if (local.length === 0) {
    element.removeAttribute('srcset');
    return { removed: true, local: 0 };
  }
  element.setAttribute('srcset', serializeSrcset(local));
  return { removed: true, local: local.length };
};

const blockSource = (source: Element): boolean => {
  const { removed, local } = stripRemoteCandidates(source);
  if (removed && local === 0) {
    source.remove();
  }
  return removed;
};

const replaceBlockedSrc = (image: Element, hasPermittedCandidate: boolean): void => {
  const width = dimensionOf(image, 'width');
  const height = dimensionOf(image, 'height');
  if (width !== null && height !== null) {
    image.setAttribute('src', placeholderImage(width, height));
    image.setAttribute('data-relay-blocked', '');
    return;
  }
  image.setAttribute('src', EMPTY_IMAGE);
  if (hasPermittedCandidate) {
    image.setAttribute('data-relay-blocked', '');
    return;
  }
  image.setAttribute('style', 'display:none!important');
  image.setAttribute('data-relay-blocked', 'hidden');
};

const blockImage = (image: Element): boolean => {
  const src = (image.getAttribute('src') ?? '').trim();
  const remoteSrc = isRemoteUrl(src);
  const { removed } = stripRemoteCandidates(image);
  if (!remoteSrc && !removed) {
    return false;
  }
  const usableSrc = src !== '' && !remoteSrc;
  const selectable = selectableCandidates(image);
  if (usableSrc || (!remoteSrc && selectable > 0)) {
    return true;
  }
  replaceBlockedSrc(image, selectable > 0 || hasSelectableSource(image));
  return true;
};

export const withBlockedImagePlaceholders = (html: string): string => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const sources = [...document.querySelectorAll('picture source')].map(blockSource);
  const images = [...document.querySelectorAll('img')].map(blockImage);
  if (![...sources, ...images].includes(true)) {
    return html;
  }
  return document.documentElement.outerHTML;
};
