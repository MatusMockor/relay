import type { OutgoingAttachment } from '@relay/engine';
import { AttachmentContentTypeSchema, FALLBACK_CONTENT_TYPE } from '@relay/shared/domain';

const CRLF = '\r\n';
const ATTRIBUTE_CHAR = /^[A-Za-z0-9!#$&+\-.^_`|~]$/;
const MAX_SEGMENT = 60;
const BASE64_LINE = 76;

const encodedTokens = (value: string): string[] =>
  Array.from(new TextEncoder().encode(value), (byte) => {
    const character = String.fromCharCode(byte);
    return ATTRIBUTE_CHAR.test(character)
      ? character
      : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  });

const segments = (tokens: readonly string[]): string[] =>
  tokens.reduce<string[]>((chunks, token) => {
    const last = chunks.at(-1);
    if (last === undefined || last.length + token.length > MAX_SEGMENT) {
      return [...chunks, token];
    }
    return [...chunks.slice(0, -1), last + token];
  }, []);

export const extendedParameter = (name: string, value: string): string => {
  const parts = segments(encodedTokens(value));
  if (parts.length <= 1) {
    return `${name}*=utf-8''${parts[0] ?? ''}`;
  }
  return parts
    .map((part, index) => `${name}*${String(index)}*=${index === 0 ? "utf-8''" : ''}${part}`)
    .join(`;${CRLF} `);
};

const BASE64_FORBIDDEN = /^(message|multipart)\//;

const safeContentType = (value: string): string => {
  const parsed = AttachmentContentTypeSchema.safeParse(value);
  if (!parsed.success || BASE64_FORBIDDEN.test(parsed.data)) {
    return FALLBACK_CONTENT_TYPE;
  }
  return parsed.data;
};

const base64Lines = (content: Uint8Array): string =>
  (
    Buffer.from(content)
      .toString('base64')
      .match(new RegExp(`.{1,${String(BASE64_LINE)}}`, 'g')) ?? []
  ).join(CRLF);

export const attachmentPart = (attachment: OutgoingAttachment): string =>
  [
    `Content-Type: ${safeContentType(attachment.contentType)};${CRLF} ${extendedParameter('name', attachment.filename)}`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment;${CRLF} ${extendedParameter('filename', attachment.filename)}`,
    '',
    base64Lines(attachment.content),
  ].join(CRLF);
