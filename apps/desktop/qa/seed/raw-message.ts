import MailComposer from 'nodemailer/lib/mail-composer';
import type { SeedMessage } from './seed-message';

export const rawMessage = (message: SeedMessage): Promise<Buffer> =>
  new MailComposer({
    messageId: message.messageId,
    from: message.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    date: message.date,
    inReplyTo: message.inReplyTo,
    references: message.references === undefined ? undefined : [...message.references],
  })
    .compile()
    .build();
