import type { AttachmentMeta } from '@relay/shared/domain';
import type { ParsedAttachment } from '../../model/parsed-message';
import type { IdGenerator } from '../../ports/id-generator';

export interface AlignedAttachments {
  readonly attachments: AttachmentMeta[];
  readonly replaced: boolean;
}

const sameAttachment = (stored: AttachmentMeta, parsed: ParsedAttachment): boolean =>
  stored.filename === parsed.filename &&
  stored.contentType.toLowerCase() === parsed.contentType.toLowerCase();

const meta = (id: AttachmentMeta['id'], parsed: ParsedAttachment): AttachmentMeta => ({
  id,
  filename: parsed.filename,
  contentType: parsed.contentType,
  size: parsed.size,
  contentId: parsed.contentId,
  inline: parsed.inline,
});

export const alignAttachments = (
  stored: readonly AttachmentMeta[],
  parsed: readonly ParsedAttachment[],
  ids: IdGenerator,
): AlignedAttachments => {
  const aligned =
    stored.length === parsed.length &&
    parsed.every((attachment, index) => {
      const known = stored[index];
      return known !== undefined && sameAttachment(known, attachment);
    });
  if (aligned) {
    return {
      attachments: parsed.map((attachment, index) =>
        meta(stored[index]?.id ?? ids.generate('attachment'), attachment),
      ),
      replaced: false,
    };
  }
  return {
    attachments: parsed.map((attachment) => meta(ids.generate('attachment'), attachment)),
    replaced: true,
  };
};
