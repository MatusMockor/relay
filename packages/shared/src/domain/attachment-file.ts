import { z } from 'zod';

const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;

export const isControlCharacter = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return code <= 0x1f || code === 0x7f;
};

const hasControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => isControlCharacter(character));

export const AttachmentFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !hasControlCharacter(value), 'Názov súboru obsahuje neplatné znaky');

export const AttachmentContentTypeSchema = z
  .string()
  .regex(MIME_TYPE, 'Neplatný typ súboru')
  .transform((value) => value.toLowerCase());

export const FALLBACK_CONTENT_TYPE = 'application/octet-stream';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  html: 'text/html',
  ics: 'text/calendar',
  json: 'application/json',
  xml: 'application/xml',
  zip: 'application/zip',
  gz: 'application/gzip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  eml: 'message/rfc822',
};

export const contentTypeForFilename = (filename: string): string => {
  const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase() ?? '';
  return CONTENT_TYPES[extension] ?? FALLBACK_CONTENT_TYPE;
};
