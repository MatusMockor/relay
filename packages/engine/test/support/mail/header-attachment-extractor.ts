import type { AttachmentContent, AttachmentExtractor } from '../../../src';

const ATTACHMENT_HEADER = /^X-Test-Attachment-\d+: ([^|]*)\|([^|]*)\|(.*)$/i;

export const attachmentHeader = (filename: string, contentType: string, content: string) =>
  `${filename}|${contentType}|${content}`;

const parse = (source: Uint8Array): AttachmentContent[] => {
  const text = new TextDecoder().decode(source);
  const end = text.indexOf('\r\n\r\n');
  return (end === -1 ? text : text.slice(0, end)).split('\r\n').flatMap((line) => {
    const match = ATTACHMENT_HEADER.exec(line);
    if (match === null) {
      return [];
    }
    return [
      {
        filename: match[1] ?? null,
        contentType: match[2] ?? 'application/octet-stream',
        content: new TextEncoder().encode(match[3] ?? ''),
      },
    ];
  });
};

export class HeaderAttachmentExtractor implements AttachmentExtractor {
  extract(source: Uint8Array, index: number): Promise<AttachmentContent | null> {
    return Promise.resolve(parse(source)[index] ?? null);
  }

  extractAll(source: Uint8Array): Promise<AttachmentContent[]> {
    return Promise.resolve(parse(source));
  }
}
