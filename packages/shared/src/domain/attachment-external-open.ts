import { safeAttachmentFilename } from './safe-attachment-filename';

const INERT_DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'heic',
  'bmp',
  'tif',
  'tiff',
  'txt',
  'csv',
  'md',
  'rtf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  'pages',
  'numbers',
  'key',
  'eml',
  'ics',
  'vcf',
  'zip',
]);

export const canOpenAttachmentExternally = (filename: string): boolean => {
  const extension =
    /\.([^.\\/]+)$/.exec(safeAttachmentFilename(filename))?.[1]?.toLowerCase() ?? '';
  return INERT_DOCUMENT_EXTENSIONS.has(extension);
};
