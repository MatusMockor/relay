export const REMOTE_IMAGE_PATTERN = /<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i;
const REMOTE_CSS_PATTERN = /url\(\s*["']?\s*(?:https?:)?\/\//i;

export const hasRemoteImages = (html: string): boolean =>
  REMOTE_IMAGE_PATTERN.test(html) || REMOTE_CSS_PATTERN.test(html);

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

export const buildMailDocument = (html: string, allowRemote: boolean): string =>
  [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(mailCsp(allowRemote))}">`,
    '<base target="_blank">',
    '<style>html,body{margin:0;padding:16px;background:#fff;color:#1b1d23;font:14px/1.5 -apple-system,"Segoe UI",Inter,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>',
    '</head><body>',
    html.replace(/<script\b[\s\S]*?<\/script>/gi, ''),
    '</body></html>',
  ].join('');
