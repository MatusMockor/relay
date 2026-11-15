import type { Address } from '@relay/shared/domain';
import type { MessageHeaders } from './split-match-subject';

export interface ParsedAttachment {
  readonly filename: string | null;
  readonly contentType: string;
  readonly size: number;
  readonly contentId: string | null;
  readonly inline: boolean;
  readonly checksum: string;
}

export interface ParsedMessage {
  readonly messageIdHeader: string | null;
  readonly inReplyTo: string | null;
  readonly references: readonly string[];
  readonly from: Address | null;
  readonly to: readonly Address[];
  readonly cc: readonly Address[];
  readonly bcc: readonly Address[];
  readonly replyTo: readonly Address[];
  readonly subject: string;
  readonly date: string;
  readonly textBody: string | null;
  readonly htmlBody: string | null;
  readonly snippet: string;
  readonly headers: MessageHeaders;
  readonly attachments: readonly ParsedAttachment[];
}
