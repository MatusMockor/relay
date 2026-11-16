import {
  AttachmentContentTypeSchema,
  AttachmentFilenameSchema,
  contentTypeForFilename,
  type PickedFiles,
} from '@relay/shared';
import type { AttachmentUploadInput } from '../../../data/MailClient';

const PASTED_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const filenameOf = (file: File, index: number): string => {
  const parsed = AttachmentFilenameSchema.safeParse(file.name);
  if (parsed.success) {
    return parsed.data;
  }
  return `vložený obrázok ${String(index + 1)}.${PASTED_EXTENSIONS[file.type] ?? 'bin'}`;
};

const contentTypeOf = (file: File, filename: string): string => {
  const declared = AttachmentContentTypeSchema.safeParse(file.type);
  return declared.success ? declared.data : contentTypeForFilename(filename);
};

export const inputsFromFiles = (files: readonly File[]): AttachmentUploadInput[] =>
  files.map((file, index) => {
    const filename = filenameOf(file, index);
    return { filename, contentType: contentTypeOf(file, filename), blob: file };
  });

export const inputsFromPicked = (picked: PickedFiles): AttachmentUploadInput[] =>
  picked.files.map((file) => ({
    filename: file.filename,
    contentType: file.contentType,
    blob: new Blob([new Uint8Array(file.content)], { type: file.contentType }),
  }));

export const filesOf = (list: FileList | null | undefined): File[] =>
  list === null || list === undefined ? [] : Array.from(list);
