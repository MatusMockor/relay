import type { RecipientEntry } from './address-parsing';

export type RecipientKind = 'to' | 'cc' | 'bcc';

export interface ComposeRecipients {
  readonly to: readonly RecipientEntry[];
  readonly cc: readonly RecipientEntry[];
  readonly bcc: readonly RecipientEntry[];
}

export const RECIPIENT_INPUT_IDS: Readonly<Record<RecipientKind, string>> = {
  to: 'nm-to',
  cc: 'nm-cc',
  bcc: 'nm-bcc',
};

export const invalidEntry = (recipients: ComposeRecipients): RecipientEntry | undefined =>
  [...recipients.to, ...recipients.cc, ...recipients.bcc].find((entry) => !entry.valid);

export const hasRecipient = (recipients: ComposeRecipients): boolean =>
  [...recipients.to, ...recipients.cc, ...recipients.bcc].some((entry) => entry.valid);
