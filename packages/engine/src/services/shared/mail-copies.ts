import type { MailAccount, MailboxRole, Message, MessagePlacement } from '@relay/shared/domain';
import { sameGmailBody, sameGmailMail } from './copy-matching';
import { mailboxAddress } from './mailbox-address';
import { placementKey } from './placement-key';

export interface PlacedCopy {
  readonly message: Message;
  readonly placement: MessagePlacement;
  readonly role: MailboxRole | undefined;
}

const copyKey = ({ message, placement }: PlacedCopy): string =>
  placementKey(message.id, placement.mailboxId);

const GMAIL_IMAP_HOSTS: ReadonlySet<string> = new Set(['imap.gmail.com', 'imap.googlemail.com']);

export const labelsMessages = (account: MailAccount): boolean =>
  account.provider === 'gmail' || GMAIL_IMAP_HOSTS.has(account.settings.imap.host.toLowerCase());

export class MailCopies {
  private constructor(
    private readonly linked: boolean,
    private readonly ownAddress: string,
  ) {}

  static of(account: MailAccount): MailCopies {
    return new MailCopies(labelsMessages(account), mailboxAddress(account.email));
  }

  logicalKeyOf(message: Message): string {
    if (!this.linked || message.emailId === null) {
      return `id:${message.id}`;
    }
    return `email:${message.emailId}`;
  }

  filedSentCopies(copies: readonly PlacedCopy[]): ReadonlySet<string> {
    const sent = copies.filter(({ role }) => role === 'sent').map(({ message }) => message);
    return new Set(
      copies
        .filter(
          ({ message, role }) =>
            role === 'archive' &&
            sent.some((other) => this.sameMail(message, other)) &&
            !this.addressedToSelf(message),
        )
        .map(copyKey),
    );
  }

  sharesBody(message: Message, donor: Message): boolean {
    return !this.linked || sameGmailBody(message, donor);
  }

  filedRoles(copies: readonly PlacedCopy[]): (MailboxRole | undefined)[] {
    const filed = this.filedSentCopies(copies);
    return copies.map((copy) => (filed.has(copyKey(copy)) ? 'sent' : copy.role));
  }

  private sameMail(left: Message, right: Message): boolean {
    return this.linked ? sameGmailMail(left, right) : left.id === right.id;
  }

  private addressedToSelf(message: Message): boolean {
    return [...message.to, ...message.cc].some(
      (address) => mailboxAddress(address.email) === this.ownAddress,
    );
  }
}
