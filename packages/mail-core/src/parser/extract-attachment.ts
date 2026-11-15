import { simpleParser } from 'mailparser';

export interface ExtractedAttachment {
  readonly filename: string | null;
  readonly contentType: string;
  readonly content: Uint8Array;
}

export const extractAttachment = async (
  source: Uint8Array,
  index: number,
): Promise<ExtractedAttachment | null> => {
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }
  const parsed = await simpleParser(Buffer.from(source), {
    skipHtmlToText: true,
    skipTextToHtml: true,
    skipImageLinks: true,
  });
  const attachment = parsed.attachments[index];
  if (attachment === undefined) {
    return null;
  }
  return {
    filename: attachment.filename ?? null,
    contentType: attachment.contentType || 'application/octet-stream',
    content: new Uint8Array(attachment.content),
  };
};
