import type { MailAccount, Message } from '@relay/shared/domain';
import type { RawMessage } from '../../model/remote-mail';
import type { Logger } from '../../ports/logger';
import type { MessageParser } from '../../ports/message-parser';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { LingeringSessions } from '../shared/lingering-sessions';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { LocatedPlacement, PlacementLocations } from '../shared/placement-locations';
import type { RemoteBody } from './remote-body-cache';
import {
  copyLocationOf,
  type RemoteCopyLocation,
  readVerifiedMessage,
} from '../shared/verified-message-read';

export type RemoteBodyOutcome =
  | { readonly kind: 'body'; readonly body: RemoteBody }
  | { readonly kind: 'missing' }
  | { readonly kind: 'offline' };

export interface RemoteBodyFetcherDeps {
  readonly sessions: LingeringSessions;
  readonly locations: PlacementLocations;
  readonly syncStates: SyncStateRepository;
  readonly parser: MessageParser;
  readonly logger: Logger;
}

const MISSING: RemoteBodyOutcome = { kind: 'missing' };
const OFFLINE: RemoteBodyOutcome = { kind: 'offline' };
const UNREACHABLE: unique symbol = Symbol('unreachable');

export class RemoteBodyFetcher {
  constructor(private readonly deps: RemoteBodyFetcherDeps) {}

  async fetch(account: MailAccount, message: Message): Promise<RemoteBodyOutcome> {
    for (const located of await this.deps.locations.of(message)) {
      const outcome = await this.fetchAt(account, message, located);
      if (outcome !== MISSING) {
        return outcome;
      }
    }
    return MISSING;
  }

  private async fetchAt(
    account: MailAccount,
    message: Message,
    located: LocatedPlacement,
  ): Promise<RemoteBodyOutcome> {
    const location = await copyLocationOf(this.deps.syncStates, located);
    if (location === null) {
      return MISSING;
    }
    const raw = await this.read(account, location);
    if (raw === UNREACHABLE) {
      return OFFLINE;
    }
    return raw === null ? MISSING : this.parse(raw, message);
  }

  private async read(
    account: MailAccount,
    location: RemoteCopyLocation,
  ): Promise<RawMessage | null | typeof UNREACHABLE> {
    try {
      return await this.deps.sessions.with(account, (provider) =>
        readVerifiedMessage(provider, location),
      );
    } catch (error) {
      return this.failed(account, error);
    }
  }

  private async parse(raw: RawMessage, message: Message): Promise<RemoteBodyOutcome> {
    const parsed = await this.deps.parser.parse(raw.source).catch(() => null);
    if (parsed === null) {
      return MISSING;
    }
    if (message.messageIdHeader !== null && parsed.messageIdHeader !== message.messageIdHeader) {
      return MISSING;
    }
    return { kind: 'body', body: { textBody: parsed.textBody, htmlBody: parsed.htmlBody } };
  }

  private failed(account: MailAccount, error: unknown): typeof UNREACHABLE {
    this.deps.logger.info('Remote message body is unavailable', {
      accountId: account.id,
      error: errorMessage(error),
    });
    return UNREACHABLE;
  }
}
