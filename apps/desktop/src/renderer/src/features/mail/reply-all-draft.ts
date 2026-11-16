import type { Address, MailAccount, Message, ThreadDetail } from '@relay/shared';
import type { ComposeInit } from '../../state/ui-store';
import { replySubject } from './reply-draft';

const keyOf = (address: Address): string => address.email.trim().toLowerCase();

const distinct = (addresses: readonly Address[], excluded: ReadonlySet<string>): Address[] =>
  addresses.reduce<{ seen: Set<string>; list: Address[] }>(
    (state, address) => {
      const key = keyOf(address);
      if (excluded.has(key) || state.seen.has(key)) {
        return state;
      }
      state.seen.add(key);
      return { seen: state.seen, list: [...state.list, address] };
    },
    { seen: new Set(), list: [] },
  ).list;

const senderOf = (message: Message): Address[] => {
  if (message.replyTo.length > 0) {
    return message.replyTo;
  }
  return message.from === null ? [] : [message.from];
};

export const replyAllRecipients = (
  detail: ThreadDetail,
  ownEmails: readonly string[],
): { readonly to: Address[]; readonly cc: Address[] } => {
  const own = new Set(ownEmails.map((email) => email.trim().toLowerCase()));
  const base = detail.messages.at(-1);
  if (base === undefined) {
    return { to: [], cc: [] };
  }
  const fromOwn = base.from === null || own.has(keyOf(base.from));
  const to = distinct([...(fromOwn ? [] : senderOf(base)), ...base.to], own);
  const cc = distinct(base.cc, new Set([...own, ...to.map(keyOf)]));
  return { to, cc };
};

export const replyAllInit = (
  detail: ThreadDetail,
  accounts: readonly MailAccount[],
): ComposeInit => {
  const { to, cc } = replyAllRecipients(
    detail,
    accounts.map((account) => account.email),
  );
  return {
    accountId: detail.thread.accountId,
    to,
    cc,
    subject: replySubject(detail.thread.subject),
    body: '',
    inReplyToThreadId: detail.thread.id,
    inReplyToMessageId: detail.messages.at(-1)?.id,
  };
};
