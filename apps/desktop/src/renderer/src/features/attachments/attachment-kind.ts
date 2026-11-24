import type { AttachmentMeta } from '@relay/shared';

export type PreviewKind = 'pdf' | 'image' | 'text' | 'file';
export type BadgeTone = 'pdf' | 'image' | 'plain';

export const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;

const PDF_TYPE = 'application/pdf';
const TEXT_TYPE = 'text/plain';

const IMAGE_TYPES: ReadonlyMap<string, string> = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['bmp', 'image/bmp'],
]);
const IMAGE_MIME_TYPES = new Set(IMAGE_TYPES.values());

const BADGE_BY_TYPE: ReadonlyMap<string, string> = new Map([
  [PDF_TYPE, 'PDF'],
  [TEXT_TYPE, 'TXT'],
  ['image/png', 'PNG'],
  ['image/jpeg', 'JPG'],
  ['image/gif', 'GIF'],
  ['image/webp', 'WEBP'],
  ['application/zip', 'ZIP'],
  ['application/msword', 'DOC'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'DOCX'],
  ['application/vnd.ms-excel', 'XLS'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'XLSX'],
]);
const BADGE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([['jpeg', 'JPG']]);
const FALLBACK_BADGE = 'SÚBOR';
const MAX_BADGE_LENGTH = 4;

const extensionOf = (attachment: AttachmentMeta): string =>
  /\.([a-z0-9]{1,8})$/i.exec(attachment.filename ?? '')?.[1]?.toLowerCase() ?? '';

const mimeOf = (attachment: AttachmentMeta): string =>
  (attachment.contentType.split(';')[0] ?? '').trim().toLowerCase();

const imageTypeOf = (attachment: AttachmentMeta): string | null => {
  const mime = mimeOf(attachment);
  if (IMAGE_MIME_TYPES.has(mime)) {
    return mime;
  }
  return IMAGE_TYPES.get(extensionOf(attachment)) ?? null;
};

const isText = (attachment: AttachmentMeta): boolean =>
  (mimeOf(attachment) === TEXT_TYPE || extensionOf(attachment) === 'txt') &&
  attachment.size <= MAX_TEXT_PREVIEW_BYTES;

export const previewTypeOf = (attachment: AttachmentMeta): string | null => {
  if (mimeOf(attachment) === PDF_TYPE || extensionOf(attachment) === 'pdf') {
    return PDF_TYPE;
  }
  const image = imageTypeOf(attachment);
  if (image !== null) {
    return image;
  }
  return isText(attachment) ? TEXT_TYPE : null;
};

export const previewKindOf = (attachment: AttachmentMeta): PreviewKind => {
  const type = previewTypeOf(attachment);
  if (type === null) {
    return 'file';
  }
  if (type === PDF_TYPE) {
    return 'pdf';
  }
  return type === TEXT_TYPE ? 'text' : 'image';
};

export const badgeOf = (attachment: AttachmentMeta): string => {
  const extension = extensionOf(attachment);
  const known = BADGE_BY_EXTENSION.get(extension);
  if (known !== undefined) {
    return known;
  }
  if (extension !== '' && extension.length <= MAX_BADGE_LENGTH) {
    return extension.toUpperCase();
  }
  return BADGE_BY_TYPE.get(mimeOf(attachment)) ?? FALLBACK_BADGE;
};

export const badgeToneOf = (attachment: AttachmentMeta): BadgeTone => {
  if (previewKindOf(attachment) === 'pdf') {
    return 'pdf';
  }
  const image = mimeOf(attachment).startsWith('image/') || imageTypeOf(attachment) !== null;
  return image ? 'image' : 'plain';
};

export const nameOf = (attachment: AttachmentMeta): string => attachment.filename ?? 'príloha';
