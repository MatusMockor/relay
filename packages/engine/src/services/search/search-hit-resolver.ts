import { type MailboxId, type Message, placementIn } from '@relay/shared/domain';
import type { MessageRepository } from '../../ports/message-repository';
import type { MessageUidLookup } from '../../ports/message-uid-lookup';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { SearchTarget } from './search-mailboxes';

export interface SearchHitResolverDeps {
  readonly messages: MessageRepository;
  readonly syncStates: SyncStateRepository;
  readonly lookup: MessageUidLookup | undefined;
}

const hitOf = (message: Message, mailboxId: MailboxId): [number, Message][] => {
  const placement = placementIn(message, mailboxId);
  return placement === undefined ? [] : [[placement.uid, message]];
};

export class SearchHitResolver {
  constructor(private readonly deps: SearchHitResolverDeps) {}

  async stored(
    target: SearchTarget,
    uids: readonly number[],
  ): Promise<Map<number, Message> | null> {
    if (uids.length === 0) {
      return new Map();
    }
    const found = await this.find(target.mailbox.id, uids);
    if (!(await this.sameUidValidity(target))) {
      return null;
    }
    return new Map(found.flatMap((message) => hitOf(message, target.mailbox.id)));
  }

  private async sameUidValidity(target: SearchTarget): Promise<boolean> {
    const current = await this.deps.syncStates.find(target.mailbox.id);
    return current?.uidValidity === target.state.uidValidity;
  }

  private async find(mailboxId: MailboxId, uids: readonly number[]): Promise<Message[]> {
    if (this.deps.lookup !== undefined) {
      return this.deps.lookup.findByUids(mailboxId, uids);
    }
    const found = await Promise.all(
      uids.map((uid) => this.deps.messages.findByLocation({ mailboxId, uid })),
    );
    return found.filter((message): message is Message => message !== null);
  }
}
