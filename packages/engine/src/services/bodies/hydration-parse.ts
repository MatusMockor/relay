import type { HydratedBody, HydrationCandidate } from '../../ports/message-body-store';
import type { IdGenerator } from '../../ports/id-generator';
import type { MessageParser } from '../../ports/message-parser';
import { alignAttachments } from './hydrated-attachments';

export type HydrationParseInput = Pick<HydrationCandidate, 'messageIdHeader' | 'attachments'>;

export class HydrationParse {
  constructor(
    private readonly parser: MessageParser,
    private readonly ids: IdGenerator,
  ) {}

  async parse(source: Uint8Array, candidate: HydrationParseInput): Promise<HydratedBody | null> {
    const parsed = await this.parser.parse(source).catch(() => null);
    if (parsed === null) {
      return null;
    }
    if (
      candidate.messageIdHeader !== null &&
      parsed.messageIdHeader !== candidate.messageIdHeader
    ) {
      return null;
    }
    const aligned = alignAttachments(candidate.attachments, parsed.attachments, this.ids);
    return {
      textBody: parsed.textBody,
      htmlBody: parsed.htmlBody,
      snippet: parsed.snippet,
      attachments: aligned.attachments,
    };
  }
}
