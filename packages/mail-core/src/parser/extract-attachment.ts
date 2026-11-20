import { type Attachment, simpleParser } from 'mailparser';

export interface ExtractedAttachment {
  readonly filename: string | null;
  readonly contentType: string;
  readonly content: Uint8Array;
}

const parseAttachments = async (source: Uint8Array): Promise<Attachment[]> => {
  const parsed = await simpleParser(Buffer.from(source), {
    skipHtmlToText: true,
    skipTextToHtml: true,
    skipImageLinks: true,
  });
  return parsed.attachments;
};

const extracted = (attachment: Attachment): ExtractedAttachment => ({
  filename: attachment.filename ?? null,
  contentType: attachment.contentType || 'application/octet-stream',
  content: new Uint8Array(attachment.content),
});

export const extractAttachment = async (
  source: Uint8Array,
  index: number,
): Promise<ExtractedAttachment | null> => {
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }
  const attachment = (await parseAttachments(source))[index];
  return attachment === undefined ? null : extracted(attachment);
};

export const extractAttachments = async (source: Uint8Array): Promise<ExtractedAttachment[]> =>
  (await parseAttachments(source)).map(extracted);
