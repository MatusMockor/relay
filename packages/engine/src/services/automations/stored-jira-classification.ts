import type { Message, MessageId } from '@relay/shared/domain';
import type { JiraClassification } from '../../model/jira';
import type { ParsedMessage } from '../../model/parsed-message';
import type { MessageHeaders } from '../../model/split-match-subject';
import type { JiraClassifier } from '../../ports/jira-classifier';

const parsedOf = (message: Message, headers: MessageHeaders): ParsedMessage => ({
  messageIdHeader: message.messageIdHeader,
  inReplyTo: message.inReplyTo,
  references: message.references,
  from: message.from,
  to: message.to,
  cc: message.cc,
  bcc: message.bcc,
  replyTo: message.replyTo,
  subject: message.subject,
  date: message.date,
  textBody: message.textBody,
  htmlBody: message.htmlBody,
  snippet: message.snippet,
  headers,
  attachments: [],
});

export const classifyStored = async (
  classifier: JiraClassifier,
  messages: readonly Message[],
  headersOf: (messageId: MessageId) => MessageHeaders,
): Promise<Map<MessageId, JiraClassification | null>> => {
  const classified = new Map<MessageId, JiraClassification | null>();
  for (const message of messages) {
    classified.set(message.id, await classifier.classify(parsedOf(message, headersOf(message.id))));
  }
  return classified;
};
