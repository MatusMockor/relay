import { htmlBodyToText } from './html-body-text';
import { looksLikeHtml } from './looks-like-html';

export interface BodyParts {
  readonly textBody: string | null;
  readonly htmlBody: string | null;
}

export const normalizeBodyParts = (parts: BodyParts): BodyParts => {
  const { textBody, htmlBody } = parts;
  if (textBody === null || !looksLikeHtml(textBody)) {
    return parts;
  }
  const converted = htmlBodyToText(textBody);
  return { textBody: converted === '' ? null : converted, htmlBody: htmlBody ?? textBody };
};
