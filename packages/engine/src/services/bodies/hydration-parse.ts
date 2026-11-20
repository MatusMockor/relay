import type { HydratedBody, HydrationCandidate } from '../../ports/message-body-store';
import type { IdGenerator } from '../../ports/id-generator';
import type { MessageParser } from '../../ports/message-parser';
import { alignAttachments } from './hydrated-attachments';

export interface ParsedHydration {
  readonly body: HydratedBody;
  readonly changedThread: boolean;
}

export class HydrationParse {
  constructor(
    private readonly parser: MessageParser,
    private readonly ids: IdGenerator,
  ) {}

  async parse(source: Uint8Array, candidate: HydrationCandidate): Promise<ParsedHydration | null> {
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
      body: {
        textBody: parsed.textBody,
        htmlBody: parsed.htmlBody,
        snippet: parsed.snippet,
        attachments: aligned.attachments,
      },
      changedThread: aligned.replaced || parsed.snippet !== candidate.snippet,
    };
  }
}
