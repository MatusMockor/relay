import type { Mailbox } from '@relay/shared/domain';
import type { MailProvider } from '../../../ports/mail-provider';
import type {
  BodyRepairCandidate,
  RepairedMessageBody,
} from '../../../ports/message-body-repair-repository';
import type { MessageParser } from '../../../ports/message-parser';

export type RefetchOutcome =
  | { readonly kind: 'repaired'; readonly body: RepairedMessageBody }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'failed'; readonly error: unknown };

const SKIPPED: RefetchOutcome = { kind: 'skipped' };

export class BodyRefetcher {
  constructor(private readonly parser: MessageParser) {}

  async refetch(
    provider: MailProvider,
    mailbox: Mailbox,
    candidate: BodyRepairCandidate,
  ): Promise<RefetchOutcome> {
    if (candidate.messageIdHeader === null) {
      return SKIPPED;
    }
    try {
      const raw = await provider.fetchMessage(mailbox.path, candidate.uid);
      return raw === null ? SKIPPED : await this.reparse(raw.source, candidate);
    } catch (error) {
      return { kind: 'failed', error };
    }
  }

  private async reparse(source: Uint8Array, candidate: BodyRepairCandidate) {
    const parsed = await this.parser.parse(source).catch(() => null);
    if (parsed === null || parsed.messageIdHeader !== candidate.messageIdHeader) {
      return SKIPPED;
    }
    const body: RepairedMessageBody = {
      textBody: parsed.textBody,
      htmlBody: parsed.htmlBody,
      snippet: parsed.snippet,
    };
    return { kind: 'repaired', body } as const;
  }
}
