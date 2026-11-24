import type {
  AccountId,
  LabelId,
  Mailbox,
  Message,
  MessageBodyState,
  ThreadId,
} from '@relay/shared/domain';
import type { ParsedMessage } from '../../model/parsed-message';
import type { RemoteMessageMeta } from '../../model/remote-mail';
import type { IdGenerator } from '../../ports/id-generator';
import { normalizeIso } from '../shared/dates';

export interface MessageDraft {
  readonly accountId: AccountId;
  readonly threadId: ThreadId;
  readonly mailbox: Mailbox;
  readonly raw: RemoteMessageMeta;
  readonly parsed: ParsedMessage;
  readonly labelIds: readonly LabelId[];
  readonly bodyState?: MessageBodyState;
}

export const buildMessage = (draft: MessageDraft, ids: IdGenerator): Message => {
  const { parsed, raw } = draft;
  return {
    id: ids.generate('message'),
    threadId: draft.threadId,
    accountId: draft.accountId,
    mailboxId: draft.mailbox.id,
    uid: raw.uid,
    messageIdHeader: parsed.messageIdHeader,
    emailId: raw.emailId,
    inReplyTo: parsed.inReplyTo,
    references: [...parsed.references],
    from: parsed.from,
    to: [...parsed.to],
    cc: [...parsed.cc],
    bcc: [...parsed.bcc],
    replyTo: [...parsed.replyTo],
    subject: parsed.subject,
    date: normalizeIso(parsed.date, raw.internalDate),
    snippet: parsed.snippet,
    textBody: parsed.textBody,
    htmlBody: parsed.htmlBody,
    flags: { ...raw.flags },
    labelIds: [...draft.labelIds],
    attachments: parsed.attachments.map((attachment) => ({
      id: ids.generate('attachment'),
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      contentId: attachment.contentId,
      inline: attachment.inline,
    })),
    ...(draft.bodyState === 'remote' ? { bodyState: 'remote' as const } : {}),
    placements: [{ mailboxId: draft.mailbox.id, uid: raw.uid }],
  };
};
