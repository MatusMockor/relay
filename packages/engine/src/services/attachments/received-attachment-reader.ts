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
import type { MessageParser } from '../../ports/message-parser';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import type { PlacementLocations } from '../shared/placement-locations';
import {
  copyLocationOf,
  type RemoteCopyLocation,
  readVerifiedMessage,
  sameMessageId,
} from '../shared/verified-message-read';
import { pickRemoteAttachment } from './remote-attachment-pick';

export interface ReceivedAttachmentReaderDeps {
  readonly lookup: MessageAttachmentLookup;
  readonly extractor: AttachmentExtractor;
  readonly accounts: AccountRepository;
  readonly locations: PlacementLocations;
  readonly syncStates: SyncStateRepository;
  readonly sessions: MailProviderSessions;
  readonly parser: MessageParser;
}

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
    const locations = await this.copyLocations(message);
    if (meta === undefined || account === null || locations.length === 0) {
      return null;
    }
    const raw = await this.deps.sessions.with(account, (provider) =>
      this.firstSource(provider, message, locations),
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

  private async firstSource(
    provider: MailProvider,
    message: Message,
    locations: readonly RemoteCopyLocation[],
  ): Promise<RawMessage | null> {
    for (const location of locations) {
      const raw = await readVerifiedMessage(provider, location);
      if (raw !== null && (await this.isSameMessage(message, raw))) {
        return raw;
      }
    }
    return null;
  }

  private async isSameMessage(message: Message, raw: RawMessage): Promise<boolean> {
    if (message.messageIdHeader === null) {
      return true;
    }
    const parsed = await this.deps.parser.parse(raw.source).catch(() => null);
    return parsed !== null && sameMessageId(message, parsed);
  }

  private async copyLocations(message: Message): Promise<RemoteCopyLocation[]> {
    const located = await this.deps.locations.of(message);
    const locations = await Promise.all(
      located.map((placement) => copyLocationOf(this.deps.syncStates, placement)),
    );
    return locations.filter((location): location is RemoteCopyLocation => location !== null);
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
