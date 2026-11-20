import type { Address } from '@relay/shared/domain';

export interface OutgoingAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly content: Uint8Array;
}

export interface OutgoingCalendarPart {
  readonly method: 'REPLY' | 'REQUEST' | 'CANCEL';
  readonly content: string;
}

export type OutgoingHeaders = Readonly<Record<string, string>>;

export interface OutgoingMessage {
  readonly from: Address;
  readonly to: readonly Address[];
  readonly cc: readonly Address[];
  readonly bcc: readonly Address[];
  readonly subject: string;
  readonly text: string;
  readonly html: string | null;
  readonly inReplyTo: string | null;
  readonly references: readonly string[];
  readonly attachments: readonly OutgoingAttachment[];
  readonly calendar?: OutgoingCalendarPart;
  readonly headers?: OutgoingHeaders;
}

export interface SentMessage {
  readonly messageIdHeader: string;
  readonly sentCopy: Uint8Array;
  readonly acceptedRecipients: readonly string[];
  readonly rejectedRecipients: readonly string[];
}
