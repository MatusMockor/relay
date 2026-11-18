import type { MailAccount, MailboxRole, Message, MessageId } from '@relay/shared/domain';

export interface PlacedCopy {
  readonly message: Message;
  readonly role: MailboxRole | undefined;
}

const GMAIL_IMAP_HOSTS: ReadonlySet<string> = new Set(['imap.gmail.com', 'imap.googlemail.com']);

const labelsMessages = (account: MailAccount): boolean =>
  account.provider === 'gmail' || GMAIL_IMAP_HOSTS.has(account.settings.imap.host.toLowerCase());

export class MailCopies {
  private constructor(
    private readonly linked: boolean,
    private readonly ownAddress: string,
  ) {}

  static of(account: MailAccount): MailCopies {
    return new MailCopies(labelsMessages(account), account.email.toLowerCase());
  }

  identityOf(message: Message): string {
    if (!this.linked || message.messageIdHeader === null) {
      return `id:${message.id}`;
    }
    return message.messageIdHeader;
  }

  filedSentCopies(copies: readonly PlacedCopy[]): ReadonlySet<MessageId> {
    const sent = new Set(
      copies.filter(({ role }) => role === 'sent').map(({ message }) => this.identityOf(message)),
    );
    return new Set(
      copies
        .filter(
          ({ message, role }) =>
            role === 'archive' &&
            sent.has(this.identityOf(message)) &&
            !this.addressedToSelf(message),
        )
        .map(({ message }) => message.id),
    );
  }

  filedRoles(copies: readonly PlacedCopy[]): (MailboxRole | undefined)[] {
    const filed = this.filedSentCopies(copies);
    return copies.map(({ message, role }) => (filed.has(message.id) ? 'sent' : role));
  }

  private addressedToSelf(message: Message): boolean {
    return [...message.to, ...message.cc].some(
      (address) => address.email.toLowerCase() === this.ownAddress,
    );
  }
}
