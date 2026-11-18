import { isRemoteUrl, parseSrcset, serializeSrcset } from './srcset';

const DEFAULT_SIZE = { width: 320, height: 80 } as const;
const MAX_SIDE = 4_000;

const dimensionOf = (image: Element, name: 'width' | 'height'): number | null => {
  const match = /^\s*(\d{1,5})/.exec(image.getAttribute(name) ?? '');
  const value = match?.[1] === undefined ? Number.NaN : Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.min(value, MAX_SIDE);
};

export const placeholderImage = (width: number, height: number): string => {
  const icon = Math.min(24, Math.max(12, Math.round(Math.min(width, height) / 3)));
  const x = (width - icon) / 2;
  const y = (height - icon) / 2;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}">`,
    `<rect width="100%" height="100%" rx="6" fill="#e4e6ea"/>`,
    `<g transform="translate(${String(x)} ${String(y)}) scale(${String(icon / 16)})" fill="none" stroke="#9ea3ae" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">`,
    '<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.2"/><path d="M14 11l-3.5-3.5L4 13"/>',
    '</g></svg>',
  ].join('');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

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

const blockImage = (image: Element): boolean => {
  const src = (image.getAttribute('src') ?? '').trim();
  const remoteSrc = isRemoteUrl(src);
  const { removed, local } = stripRemoteCandidates(image);
  if (!remoteSrc && !removed) {
    return false;
  }
  const usableSrc = src !== '' && !remoteSrc;
  if (usableSrc || (!remoteSrc && local > 0)) {
    return true;
  }
  const width = dimensionOf(image, 'width') ?? DEFAULT_SIZE.width;
  const height = dimensionOf(image, 'height') ?? DEFAULT_SIZE.height;
  image.setAttribute('src', placeholderImage(width, height));
  image.setAttribute('data-relay-blocked', '');
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
