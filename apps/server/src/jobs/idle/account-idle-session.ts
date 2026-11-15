import type {
  CredentialVault,
  Disposer,
  Logger,
  MailboxRepository,
  MailProvider,
  MailProviderFactory,
} from '@relay/engine';
import type { MailAccount } from '@relay/shared/domain';
import { backoffDelay, type BackoffPolicy } from './backoff';

export interface AccountIdleSessionDeps {
  readonly providers: MailProviderFactory;
  readonly vault: CredentialVault;
  readonly mailboxes: MailboxRepository;
  readonly logger: Logger;
  readonly backoff: BackoffPolicy;
  readonly onChange: () => void;
}

const DEFAULT_INBOX_PATH = 'INBOX';

export class AccountIdleSession {
  private provider: MailProvider | null = null;
  private disposer: Disposer | null = null;
  private timer: NodeJS.Timeout | null = null;
  private attempts = 0;
  private stopped = false;
  private pending: Promise<void> | null = null;

  constructor(
    readonly account: MailAccount,
    private readonly deps: AccountIdleSessionDeps,
  ) {}

  start(): void {
    this.launch();
  }

  get running(): boolean {
    return this.disposer !== null;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.pending;
    await this.release();
  }

  private launch(): void {
    this.pending = this.attempt().finally(() => {
      this.pending = null;
    });
  }

  private async attempt(): Promise<void> {
    try {
      await this.open();
      this.attempts = 0;
    } catch (error) {
      await this.release();
      this.scheduleRetry(error);
    }
  }

  private async open(): Promise<void> {
    const credentials = await this.deps.vault.get(this.account.id);
    if (credentials === null) {
      throw new Error('Account has no stored credentials');
    }
    const inbox = await this.deps.mailboxes.findByRole(this.account.id, 'inbox');
    if (this.stopped) {
      return;
    }
    const provider = this.deps.providers.create(this.account, credentials);
    this.provider = provider;
    this.disposer = await provider.idle(inbox?.path ?? DEFAULT_INBOX_PATH, () => {
      this.deps.onChange();
    });
  }

  private scheduleRetry(error: unknown): void {
    if (this.stopped) {
      return;
    }
    this.attempts += 1;
    const delay = backoffDelay(this.deps.backoff, this.attempts);
    this.deps.logger.warn('IMAP IDLE failed, retrying', {
      accountId: this.account.id,
      attempt: this.attempts,
      delayMs: delay,
      error: error instanceof Error ? error.message : String(error),
    });
    this.timer = setTimeout(() => {
      this.timer = null;
      this.launch();
    }, delay);
  }

  private async release(): Promise<void> {
    const disposer = this.disposer;
    const provider = this.provider;
    this.disposer = null;
    this.provider = null;
    await disposer?.().catch(() => undefined);
    await provider?.close().catch(() => undefined);
  }
}
