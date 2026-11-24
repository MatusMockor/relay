import {
  type AttachmentId,
  type AttachmentMeta,
  isBodyLocal,
  type Message,
  type UserId,
} from '@relay/shared/domain';
import type { AttachmentContent } from '../../model/attachment';
import type { RawMessage } from '../../model/remote-mail';
import type { AccountRepository } from '../../ports/account-repository';
import type { AttachmentExtractor } from '../../ports/attachment-extractor';
import type { MailProvider } from '../../ports/mail-provider';
import type { MessageAttachmentLookup } from '../../ports/message-attachment-lookup';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import type { LocatedPlacement, PlacementLocations } from '../shared/placement-locations';
import { pickRemoteAttachment } from './remote-attachment-pick';

export interface ReceivedAttachmentReaderDeps {
  readonly lookup: MessageAttachmentLookup;
  readonly extractor: AttachmentExtractor;
  readonly accounts: AccountRepository;
  readonly locations: PlacementLocations;
  readonly sessions: MailProviderSessions;
}

const firstSource = async (
  provider: MailProvider,
  located: readonly LocatedPlacement[],
): Promise<RawMessage | null> => {
  for (const { placement, mailbox } of located) {
    const raw = await provider.fetchMessage(mailbox.path, placement.uid);
    if (raw !== null) {
      return raw;
    }
  }
  return null;
};

export class ReceivedAttachmentReader {
  constructor(private readonly deps: ReceivedAttachmentReaderDeps) {}

  async read(userId: UserId, attachmentId: AttachmentId): Promise<AttachmentContent | null> {
    const message = await this.deps.lookup.findByAttachmentId(userId, attachmentId);
    if (message === null) {
      return null;
    }
    const index = message.attachments.findIndex((attachment) => attachment.id === attachmentId);
    const meta = message.attachments[index];
    const account = await this.deps.accounts.findById(userId, message.accountId);
    const located = await this.deps.locations.of(message);
    if (meta === undefined || account === null || located.length === 0) {
      return null;
    }
    const raw = await this.deps.sessions.with(account, (provider) =>
      firstSource(provider, located),
    );
    const extracted = raw === null ? null : await this.extract(message, raw.source, index, meta);
    if (extracted === null) {
      return null;
    }
    return {
      filename: meta.filename ?? extracted.filename,
      contentType: meta.contentType,
      content: extracted.content,
    };
  }

  private async extract(
    message: Message,
    source: Uint8Array,
    index: number,
    meta: AttachmentMeta,
  ): Promise<AttachmentContent | null> {
    if (isBodyLocal(message)) {
      return this.deps.extractor.extract(source, index);
    }
    return pickRemoteAttachment(await this.deps.extractor.extractAll(source), index, meta);
  }
}
