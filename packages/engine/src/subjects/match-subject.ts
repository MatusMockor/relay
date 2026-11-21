import type { Message } from '@relay/shared/domain';
import type { MessageHeaders, SplitMatchSubject } from '../model/split-match-subject';

export const hasFileAttachments = (attachments: readonly { readonly inline: boolean }[]): boolean =>
  attachments.some((attachment) => !attachment.inline);

export const matchSubjectOf = (message: Message, headers: MessageHeaders): SplitMatchSubject => ({
  from: message.from,
  subject: message.subject,
  headers,
  to: message.to,
  cc: message.cc,
  hasAttachments: hasFileAttachments(message.attachments),
});
