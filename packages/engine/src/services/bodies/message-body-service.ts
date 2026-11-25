import {
  isBodyLocal,
  type Message,
  type MessageBodyResult,
  type MessageId,
  type UserId,
} from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { MessageRepository } from '../../ports/message-repository';
import { SingleFlight } from '../shared/single-flight';
import { MAX_BODY_COPIES, type MessageCopyFinder } from './message-copies';
import type { RemoteBody, RemoteBodyCache } from './remote-body-cache';
import type { RemoteBodyFetcher } from './remote-body-fetcher';

export interface MessageBodyServiceDeps {
  readonly messages: MessageRepository;
  readonly accounts: AccountRepository;
  readonly copies: MessageCopyFinder;
  readonly fetcher: RemoteBodyFetcher;
  readonly cache: RemoteBodyCache;
}

const OFFLINE: MessageBodyResult = { status: 'offline' };
const GONE: MessageBodyResult = { status: 'gone' };

const fetched = (body: RemoteBody): MessageBodyResult => ({
  status: 'ok',
  textBody: body.textBody,
  htmlBody: body.htmlBody,
});

export class MessageBodyService {
  private readonly flights = new SingleFlight<MessageId, MessageBodyResult>();

  constructor(private readonly deps: MessageBodyServiceDeps) {}

  async get(userId: UserId, messageId: MessageId): Promise<MessageBodyResult> {
    const message = await this.deps.messages.findById(userId, messageId);
    if (message === null) {
      throw new NotFoundError('Message', messageId);
    }
    if (isBodyLocal(message)) {
      return { status: 'local', textBody: message.textBody, htmlBody: message.htmlBody };
    }
    const cached = this.deps.cache.get(message.id);
    if (cached !== null) {
      return fetched(cached);
    }
    return this.flights.run(message.id, () => this.load(userId, message));
  }

  private async load(userId: UserId, message: Message): Promise<MessageBodyResult> {
    const account = await this.deps.accounts.findById(userId, message.accountId);
    if (account === null) {
      return GONE;
    }
    const copies = await this.deps.copies.otherCopies(account, message);
    const stored = copies.find(isBodyLocal);
    if (stored !== undefined) {
      return fetched(stored);
    }
    for (const candidate of [message, ...copies.slice(0, MAX_BODY_COPIES)]) {
      const outcome = await this.deps.fetcher.fetch(account, candidate);
      if (outcome.kind === 'offline') {
        return OFFLINE;
      }
      if (outcome.kind === 'body') {
        this.deps.cache.set(message.id, outcome.body);
        return fetched(outcome.body);
      }
    }
    return GONE;
  }
}
