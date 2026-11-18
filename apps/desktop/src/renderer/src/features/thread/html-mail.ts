import { withBlockedImagePlaceholders } from './blocked-images';
import { isRemoteUrl, parseSrcset } from './srcset';

const REMOTE_CSS_PATTERN = /url\(\s*["']?\s*(?:https?:)?\/\//i;

const hasRemoteCandidate = (element: Element): boolean =>
  parseSrcset(element.getAttribute('srcset') ?? '').some((candidate) => isRemoteUrl(candidate.url));

const isRemoteImage = (image: Element): boolean =>
  isRemoteUrl(image.getAttribute('src') ?? '') || hasRemoteCandidate(image);

export const hasRemoteImages = (html: string): boolean => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return (
    [...document.querySelectorAll('img')].some(isRemoteImage) ||
    [...document.querySelectorAll('source')].some(hasRemoteCandidate) ||
    REMOTE_CSS_PATTERN.test(html)
  );
};

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

const BASE_STYLE = [
  'html{margin:0;padding:0;background:#f3f4f6;overflow:hidden!important}',
  'body{display:flow-root;margin:0;padding:16px;color:#1b1d23;font:14px/1.5 -apple-system,"Segoe UI",Inter,sans-serif;overflow-wrap:anywhere}',
  'img{max-width:100%;height:auto}',
  'a{color:#3d4fc7;text-decoration-thickness:1px;text-underline-offset:2px}',
  'body>*{max-width:600px}',
].join('');

const documentOf = (html: string, allowRemote: boolean): string =>
  [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(mailCsp(allowRemote))}">`,
    '<base target="_blank">',
    `<style>${BASE_STYLE}</style>`,
    '</head><body>',
    html.replace(/<script\b[\s\S]*?<\/script>/gi, ''),
    '</body></html>',
  ].join('');

export const buildMailDocument = (html: string, allowRemote: boolean): string =>
  documentOf(allowRemote ? html : withBlockedImagePlaceholders(html), allowRemote);
