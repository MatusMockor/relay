import { withBlockedImagePlaceholders } from './blocked-images';

const IMAGE_TAG_PATTERN = /<(img|source)\b[^>]*>/gi;
const IMAGE_ATTRIBUTE_PATTERN = /(?<![\w-])(src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const REMOTE_URL_PATTERN = /^\s*(?:https?:)?\/\//i;
const REMOTE_CSS_PATTERN = /url\(\s*["']?\s*(?:https?:)?\/\//i;

const candidatesOf = (name: string, value: string): string[] =>
  name.toLowerCase() === 'srcset' ? value.split(',') : [value];

const isRemoteImageTag = (tag: string, element: string): boolean =>
  [...tag.matchAll(IMAGE_ATTRIBUTE_PATTERN)].some((match) => {
    const name = match[1] ?? '';
    if (element === 'source' && name.toLowerCase() !== 'srcset') {
      return false;
    }
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    return candidatesOf(name, value).some((candidate) => REMOTE_URL_PATTERN.test(candidate));
  });

export const hasRemoteImages = (html: string): boolean =>
  [...html.matchAll(IMAGE_TAG_PATTERN)].some((match) =>
    isRemoteImageTag(match[0], (match[1] ?? '').toLowerCase()),
  ) || REMOTE_CSS_PATTERN.test(html);

export const mailCsp = (allowRemote: boolean): string =>
  [
    "default-src 'none'",
    `img-src data: cid:${allowRemote ? ' https: http:' : ''}`,
    "style-src 'unsafe-inline'",
    `font-src data:${allowRemote ? ' https:' : ''}`,
    "media-src 'none'",
    "script-src 'none'",
    "form-action 'none'",
  ].join('; ');

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const documentOf = (html: string, allowRemote: boolean): string =>
  [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(mailCsp(allowRemote))}">`,
    '<base target="_blank">',
    '<style>html,body{margin:0;padding:16px;background:#ebebef;color:#1b1d23;font:14px/1.5 -apple-system,"Segoe UI",Inter,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#3d4fc7;text-decoration-thickness:1px;text-underline-offset:2px}body>*{max-width:600px}</style>',
    '</head><body>',
    html.replace(/<script\b[\s\S]*?<\/script>/gi, ''),
    '</body></html>',
  ].join('');

export const buildMailDocument = (html: string, allowRemote: boolean): string =>
  documentOf(allowRemote ? html : withBlockedImagePlaceholders(html), allowRemote);
