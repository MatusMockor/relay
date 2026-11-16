import type { OutgoingMessage } from '@relay/engine';
import type { Address } from '@relay/shared/domain';
import type Mail from 'nodemailer/lib/mailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { attachmentPart } from './attachment-part';

export interface ComposedMime {
  readonly raw: Buffer;
  readonly sentCopy: Buffer;
  readonly messageIdHeader: string;
  readonly envelope: { readonly from: string; readonly to: string[] };
}

const toMailAddress = (address: Address): Mail.Address => ({
  name: address.name ?? '',
  address: address.email,
});

export const toMailOptions = (message: OutgoingMessage): Mail.Options => ({
  from: toMailAddress(message.from),
  to: message.to.map(toMailAddress),
  cc: message.cc.map(toMailAddress),
  bcc: message.bcc.map(toMailAddress),
  subject: message.subject,
  text: message.text,
  html: message.html ?? undefined,
  inReplyTo: message.inReplyTo ?? undefined,
  references: message.references.length > 0 ? [...message.references] : undefined,
  attachments: message.attachments.map((attachment) => ({ raw: attachmentPart(attachment) })),
  icalEvent:
    message.calendar === undefined
      ? undefined
      : { method: message.calendar.method, content: message.calendar.content },
});

export const composeMime = async (message: OutgoingMessage): Promise<ComposedMime> => {
  const node = new MailComposer(toMailOptions(message)).compile();
  const envelope = node.getEnvelope();
  const raw = await node.build();
  node.keepBcc = true;
  const sentCopy = await node.build();
  return {
    raw,
    sentCopy,
    messageIdHeader: node.messageId(),
    envelope: { from: envelope.from || message.from.email, to: envelope.to },
  };
};
