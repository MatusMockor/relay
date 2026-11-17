import type { AccountId, Address, Draft, DraftAttachment, DraftContent } from '@relay/shared';
import type { ComposeInit } from '../../state/ui-store';
import { entriesOf, validAddresses } from './recipients/address-parsing';
import type { ComposeRecipients, RecipientKind } from './recipients/compose-recipients';

export interface ComposeStart {
  readonly recipients: ComposeRecipients;
  readonly visible: ReadonlySet<RecipientKind>;
  readonly subject: string;
  readonly body: string;
  readonly attachments: readonly DraftAttachment[];
}

const initialTo = (init: ComposeInit): readonly Address[] => {
  if (init.to !== undefined) {
    return init.to;
  }
  return init.toEmail === undefined ? [] : [{ name: init.toName ?? null, email: init.toEmail }];
};

export const composeStart = (init: ComposeInit, draft: Draft | undefined): ComposeStart => {
  const recipients: ComposeRecipients = {
    to: entriesOf(init.to ?? draft?.to ?? initialTo(init)),
    cc: entriesOf(init.cc ?? draft?.cc ?? []),
    bcc: entriesOf(init.bcc ?? draft?.bcc ?? []),
  };
  const visible = new Set<RecipientKind>(
    (['cc', 'bcc'] as const).filter((kind) => recipients[kind].length > 0),
  );
  return {
    recipients,
    visible,
    subject: init.subject ?? draft?.subject ?? '',
    body: init.body ?? draft?.body ?? '',
    attachments: draft?.attachments ?? [],
  };
};

export interface ComposeFields {
  readonly accountId: AccountId;
  readonly recipients: ComposeRecipients;
  readonly subject: string;
  readonly body: string;
  readonly attachments: readonly DraftAttachment[];
  readonly init: ComposeInit;
}

export const composeContent = (fields: ComposeFields): DraftContent => ({
  accountId: fields.accountId,
  to: validAddresses(fields.recipients.to),
  cc: validAddresses(fields.recipients.cc),
  bcc: validAddresses(fields.recipients.bcc),
  subject: fields.subject.trim(),
  body: fields.body,
  inReplyToThreadId: fields.init.inReplyToThreadId ?? null,
  inReplyToMessageId: fields.init.inReplyToMessageId ?? null,
  attachments: [...fields.attachments],
});

export const withoutAttachments = ({
  attachments: _attachments,
  ...patch
}: DraftContent): Omit<DraftContent, 'attachments'> => patch;
