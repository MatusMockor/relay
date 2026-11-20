import type { AccountId, MailAccount, UserId } from '@relay/shared/domain';
import type { AccountRepository } from '../../ports/account-repository';
import type { Logger } from '../../ports/logger';
import type { MessageBodyStore } from '../../ports/message-body-store';
import type { OfflineWindowPolicy } from '../../ports/offline-window-policy';
import type { EngineEvents } from '../shared/engine-events';
import { yieldToEventLoop } from '../shared/event-loop';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { OfflineBodyOptions } from './offline-body-options';

export interface EvictionReport {
  readonly evicted: number;
  readonly more: boolean;
}

export interface BodyRetentionDeps {
  readonly accounts: AccountRepository;
  readonly store: MessageBodyStore | null;
  readonly policy: OfflineWindowPolicy | null;
  readonly events: EngineEvents;
  readonly logger: Logger;
  readonly options: OfflineBodyOptions;
}

const NOTHING: EvictionReport = { evicted: 0, more: false };

export class BodyRetention {
  constructor(private readonly deps: BodyRetentionDeps) {}

  async evictDue(userId: UserId): Promise<EvictionReport> {
    const { store, policy } = this.deps;
    if (store === null || policy === null) {
      return NOTHING;
    }
    const cutoff = await policy.cutoff();
    if (cutoff === null) {
      return NOTHING;
    }
    let chunks = this.deps.options.evictChunksPerTick;
    let evicted = 0;
    for (const account of await this.deps.accounts.listByUser(userId)) {
      const report = await this.account(store, account, cutoff, chunks);
      evicted += report.evicted;
      chunks -= report.chunks;
      if (chunks <= 0 && report.more) {
        return { evicted, more: true };
      }
    }
    return { evicted, more: false };
  }

  private async account(
    store: MessageBodyStore,
    account: MailAccount,
    cutoff: Date,
    chunks: number,
  ): Promise<EvictionReport & { readonly chunks: number }> {
    const { evictChunk } = this.deps.options;
    let evicted = 0;
    for (let used = 0; used < chunks; used += 1) {
      const count = await store.evictBefore(account.id, cutoff, evictChunk);
      evicted += count;
      await yieldToEventLoop();
      if (count < evictChunk) {
        await this.announce(account, evicted);
        return { evicted, more: false, chunks: used + 1 };
      }
    }
    await this.announce(account, evicted);
    return { evicted, more: true, chunks };
  }

  private async announce(account: MailAccount, evicted: number): Promise<void> {
    if (evicted === 0) {
      return;
    }
    this.deps.logger.info('Offline bodies evicted', { accountId: account.id, evicted });
    await this.deps.events
      .emit(account.userId, 'threads.changed', { accountId: account.id, count: evicted })
      .catch((error: unknown) => {
        this.warn(account.id, error);
      });
  }

  private warn(accountId: AccountId, error: unknown): void {
    this.deps.logger.warn('Failed to announce evicted offline bodies', {
      accountId,
      error: errorMessage(error),
    });
  }
}
