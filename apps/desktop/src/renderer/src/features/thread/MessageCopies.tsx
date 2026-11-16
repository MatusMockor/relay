import type { Address, Message } from '@relay/shared';

const COPIES = [
  ['cc', 'kópia'],
  ['bcc', 'skrytá kópia'],
] as const;

const nameOf = (address: Address): string => address.name ?? address.email;

export function MessageCopies({ message }: { readonly message: Message }) {
  return COPIES.filter(([kind]) => message[kind].length > 0).map(([kind, label]) => (
    <small
      key={kind}
      className="mh-copy"
      title={message[kind].map((address) => address.email).join(', ')}
    >
      {`${label}: ${message[kind].map(nameOf).join(', ')}`}
    </small>
  ));
}
