import type { MailAccount, MailboxRole, Message, MessagePlacement } from '@relay/shared/domain';
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

  identityOf(message: Message): string {
    if (!this.linked || message.messageIdHeader === null) {
      return `id:${message.id}`;
    }
    return message.messageIdHeader;
  }

  filedSentCopies(copies: readonly PlacedCopy[]): ReadonlySet<string> {
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
        .map(copyKey),
    );
  }

  filedRoles(copies: readonly PlacedCopy[]): (MailboxRole | undefined)[] {
    const filed = this.filedSentCopies(copies);
    return copies.map((copy) => (filed.has(copyKey(copy)) ? 'sent' : copy.role));
  }

  private addressedToSelf(message: Message): boolean {
    return [...message.to, ...message.cc].some(
      (address) => mailboxAddress(address.email) === this.ownAddress,
    );
  }
}
