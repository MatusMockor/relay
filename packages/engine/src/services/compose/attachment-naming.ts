import {
  AttachmentContentTypeSchema,
  FALLBACK_CONTENT_TYPE,
  isControlCharacter,
} from '@relay/shared/domain';

const FALLBACK_FILENAME = 'príloha';
const MAX_FILENAME_LENGTH = 255;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const printable = (value: string): string =>
  Array.from(value)
    .filter((character) => !isControlCharacter(character))
    .join('')
    .trim();

const truncated = (value: string): string =>
  Array.from(graphemes.segment(value)).reduce(
    (kept, { segment }) =>
      kept.length + segment.length > MAX_FILENAME_LENGTH ? kept : kept + segment,
    '',
  );

export const attachmentFilename = (candidates: readonly (string | null)[]): string => {
  const name = candidates
    .map((candidate) => printable(candidate ?? ''))
    .find((value) => value !== '');
  return truncated(name ?? FALLBACK_FILENAME);
};

export const attachmentContentType = (value: string): string => {
  const parsed = AttachmentContentTypeSchema.safeParse(value.split(';')[0]?.trim() ?? '');
  return parsed.success ? parsed.data : FALLBACK_CONTENT_TYPE;
};
