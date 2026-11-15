import type { AccountId, Address, Draft, DraftAttachment, DraftContent } from '@relay/shared';

export interface DraftExtras {
  readonly to: readonly Address[];
  readonly cc: readonly Address[];
  readonly bcc: readonly Address[];
  readonly attachments: readonly DraftAttachment[];
}

export const NO_EXTRAS: DraftExtras = { to: [], cc: [], bcc: [], attachments: [] };

export const extrasOf = (draft: Draft | undefined): DraftExtras =>
  draft === undefined
    ? NO_EXTRAS
    : {
        to: draft.to.slice(1),
        cc: draft.cc,
        bcc: draft.bcc,
        attachments: draft.attachments,
      };

export const recipientsWith = (first: Address | null, extras: DraftExtras): Address[] => [
  ...(first === null ? [] : [first]),
  ...extras.to.filter((address) => address.email !== first?.email),
];

export interface ComposeFields {
  readonly accountId: AccountId;
  readonly to: Address | null;
  readonly subject: string;
  readonly body: string;
  readonly extras: DraftExtras;
}

export const composePayload = ({
  accountId,
  to,
  subject,
  body,
  extras,
}: ComposeFields): DraftContent => ({
  accountId,
  to: recipientsWith(to, extras),
  cc: [...extras.cc],
  bcc: [...extras.bcc],
  subject: subject.trim(),
  body,
  inReplyToThreadId: null,
  inReplyToMessageId: null,
  attachments: [...extras.attachments],
});
