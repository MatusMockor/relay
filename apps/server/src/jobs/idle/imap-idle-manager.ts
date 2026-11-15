import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  type AccountRepository,
  type CredentialVault,
  type Logger,
  type MailboxRepository,
  type MailProviderFactory,
  PORT_TOKENS,
} from '@relay/engine';
import type { AccountId, MailAccount } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import { SERVER_CONFIG, type ServerConfig } from '../../config/server-config';
import { DomainEventBus } from '../../events/domain-event-bus';
import { SyncTrigger } from '../sync/sync-trigger';
import { AccountIdleSession } from './account-idle-session';
import { IDLE_BACKOFF } from './backoff';

const fingerprint = (account: MailAccount): string => JSON.stringify(account.settings);

@Injectable()
export class ImapIdleManager implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly sessions = new Map<AccountId, AccountIdleSession>();
  private readonly lifecycles = new Map<AccountId, Promise<void>>();
  private closed = false;
  private unsubscribe: (() => void) | null = null;
  private readonly logger: Logger;

  constructor(
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(PORT_TOKENS.AccountRepository) private readonly accounts: AccountRepository,
    @Inject(PORT_TOKENS.MailboxRepository) private readonly mailboxes: MailboxRepository,
    @Inject(PORT_TOKENS.MailProviderFactory) private readonly providers: MailProviderFactory,
    @Inject(PORT_TOKENS.CredentialVault) private readonly vault: CredentialVault,
    @Inject(PORT_TOKENS.Logger) logger: Logger,
    private readonly bus: DomainEventBus,
    private readonly trigger: SyncTrigger,
  ) {
    this.logger = logger.child({ component: 'ImapIdleManager' });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.jobs.enabled || !this.config.jobs.imapIdleEnabled) {
      return;
    }
    this.unsubscribe = this.bus.subscribe((_userId, event) => this.handle(event));
    const accounts = await this.accounts.listSyncable();
    accounts.forEach((account) => {
      this.ensure(account);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;
    this.unsubscribe?.();
    await Promise.all([...this.lifecycles.values()]);
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(sessions.map((session) => session.stop()));
  }

  watching(accountId: AccountId): boolean {
    return this.sessions.get(accountId)?.running ?? false;
  }

  private handle(event: RealtimeEvent): Promise<void> {
    if (event.type === 'account.removed') {
      return this.serialize(event.data.accountId, () => this.stop(event.data.accountId));
    }
    if (event.type !== 'account.upserted') {
      return Promise.resolve();
    }
    const account = event.data.account;
    return this.serialize(account.id, () => this.restart(account));
  }

  private serialize(accountId: AccountId, work: () => Promise<void>): Promise<void> {
    const previous = this.lifecycles.get(accountId) ?? Promise.resolve();
    const next = previous.then(work, work).finally(() => {
      if (this.lifecycles.get(accountId) === next) {
        this.lifecycles.delete(accountId);
      }
    });
    this.lifecycles.set(accountId, next);
    return next;
  }

  private async restart(account: MailAccount): Promise<void> {
    if (account.status === 'disconnected') {
      await this.stop(account.id);
      return;
    }
    const current = this.sessions.get(account.id);
    if (current?.running === true && fingerprint(current.account) === fingerprint(account)) {
      return;
    }
    await this.stop(account.id);
    this.ensure(account);
  }

  private ensure(account: MailAccount): void {
    if (this.closed || this.sessions.has(account.id) || account.status === 'disconnected') {
      return;
    }
    const session = new AccountIdleSession(account, {
      providers: this.providers,
      vault: this.vault,
      mailboxes: this.mailboxes,
      logger: this.logger,
      backoff: IDLE_BACKOFF,
      onChange: () => {
        this.trigger.request(account.userId, account.id).catch((error: unknown) => {
          this.logger.error('Failed to enqueue sync after IDLE change', { error });
        });
      },
    });
    this.sessions.set(account.id, session);
    session.start();
  }

  private async stop(accountId: AccountId): Promise<void> {
    const session = this.sessions.get(accountId);
    this.sessions.delete(accountId);
    await session?.stop();
  }
}
