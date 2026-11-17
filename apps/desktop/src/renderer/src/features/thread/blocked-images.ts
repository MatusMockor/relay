const IMG_TAG_PATTERN = /<img\b[^>]*>/gi;
const SRC_PATTERN = /(?<![\w-])src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const SRCSET_PATTERN = /\s(?<![\w-])srcset\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const REMOTE_URL_PATTERN = /^\s*(?:https?:)?\/\//i;
const DEFAULT_SIZE = { width: 320, height: 80 } as const;
const MAX_SIDE = 4_000;

const dimensionOf = (tag: string, name: 'width' | 'height'): number | null => {
  const match = new RegExp(`(?<![\\w-])${name}\\s*=\\s*["']?(\\d{1,5})`, 'i').exec(tag);
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
    `<rect width="100%" height="100%" rx="6" fill="#e7e8ed"/>`,
    `<g transform="translate(${String(x)} ${String(y)}) scale(${String(icon / 16)})" fill="none" stroke="#9ea3b0" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">`,
    '<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.2"/><path d="M14 11l-3.5-3.5L4 13"/>',
    '</g></svg>',
  ].join('');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const replaceRemoteImage = (tag: string): string => {
  const source = SRC_PATTERN.exec(tag);
  const value = source === null ? '' : (source[1] ?? source[2] ?? source[3] ?? '');
  if (!REMOTE_URL_PATTERN.test(value)) {
    return tag;
  }
  const width = dimensionOf(tag, 'width') ?? DEFAULT_SIZE.width;
  const height = dimensionOf(tag, 'height') ?? DEFAULT_SIZE.height;
  return tag
    .replace(SRCSET_PATTERN, '')
    .replace(SRC_PATTERN, `src="${placeholderImage(width, height)}" data-relay-blocked=""`);
};

export const withBlockedImagePlaceholders = (html: string): string =>
  html.replace(IMG_TAG_PATTERN, replaceRemoteImage);
