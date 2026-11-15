import type { MailboxChange } from '@relay/engine';
import type { ImapFlow } from 'imapflow';
import type { ImapClientFactory } from './imap-client-factory';
import { toProviderError } from './imap-errors';
import { backoffDelay, DEFAULT_BACKOFF, type BackoffPolicy } from './reconnect-backoff';

export interface IdleWatcherOptions {
  readonly autoIdleDelayMs: number;
  readonly maxIdleTimeMs: number;
  readonly backoff: BackoffPolicy;
}

export const DEFAULT_IDLE_OPTIONS: IdleWatcherOptions = {
  autoIdleDelayMs: 500,
  maxIdleTimeMs: 5 * 60_000,
  backoff: DEFAULT_BACKOFF,
};

type ChangeListener = (change: MailboxChange) => void;

export class IdleWatcher {
  private client: ImapFlow | null = null;
  private disposed = false;
  private started = false;
  private attempts = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly factory: ImapClientFactory,
    private readonly mailboxPath: string,
    private readonly onChange: ChangeListener,
    private readonly options: IdleWatcherOptions = DEFAULT_IDLE_OPTIONS,
  ) {}

  async start(): Promise<void> {
    await this.open(false).catch((error: unknown) => {
      throw toProviderError('idle', error);
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const client = this.client;
    this.client = null;
    if (!client) {
      return;
    }
    await client.logout().catch(() => {
      client.close();
    });
  }

  private async open(reconnected: boolean): Promise<void> {
    const client = await this.factory.create({
      autoIdleDelayMs: this.options.autoIdleDelayMs,
      maxIdleTimeMs: this.options.maxIdleTimeMs,
    });
    this.attach(client);
    const mailbox = await client
      .connect()
      .then(() => client.mailboxOpen(this.mailboxPath, { readOnly: true }))
      .catch((error: unknown) => {
        client.close();
        throw error;
      });
    if (this.disposed) {
      await client.logout();
      return;
    }
    this.client = client;
    this.started = true;
    this.attempts = 0;
    if (reconnected) {
      this.onChange({ type: 'exists', mailboxPath: this.mailboxPath, count: mailbox.exists });
    }
  }

  private attach(client: ImapFlow): void {
    client.on('error', () => {
      client.close();
    });
    client.on('close', () => {
      this.handleClose(client);
    });
    client.on('exists', (event) => {
      this.onChange({ type: 'exists', mailboxPath: event.path, count: event.count });
    });
    client.on('expunge', (event) => {
      this.onChange({ type: 'expunge', mailboxPath: event.path, uid: event.uid ?? null });
    });
    client.on('flags', (event) => {
      this.onChange({ type: 'flags', mailboxPath: event.path, uid: event.uid ?? null });
    });
  }

  private handleClose(client: ImapFlow): void {
    if (this.client === client) {
      this.client = null;
    }
    if (this.disposed || !this.started) {
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.timer) {
      return;
    }
    this.attempts += 1;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        if (this.disposed) {
          return;
        }
        this.open(true).catch(() => {
          this.scheduleReconnect();
        });
      },
      backoffDelay(this.options.backoff, this.attempts),
    );
  }
}
