import type { ImapFlow, MailboxObject } from 'imapflow';
import type { ImapClientFactory } from './imap-client-factory';
import { isAuthenticationError, toProviderError } from './imap-errors';

export interface RunOptions {
  readonly operation: string;
  readonly retryOnDisconnect: boolean;
}

export type MailboxWork<Result> = (client: ImapFlow, mailbox: MailboxObject) => Promise<Result>;

export class ImapConnection {
  private client: ImapFlow | null = null;
  private connecting: Promise<ImapFlow> | null = null;

  constructor(private readonly factory: ImapClientFactory) {}

  async acquire(): Promise<ImapFlow> {
    if (this.client?.usable) {
      return this.client;
    }
    this.connecting ??= this.open().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async run<Result>(
    options: RunOptions,
    work: (client: ImapFlow) => Promise<Result>,
  ): Promise<Result> {
    const client = await this.acquireOrFail(options.operation);
    try {
      return await work(client);
    } catch (error) {
      if (client.usable || !options.retryOnDisconnect || isAuthenticationError(error)) {
        throw toProviderError(options.operation, error);
      }
      this.drop(client);
      const fresh = await this.acquireOrFail(options.operation);
      return work(fresh).catch((retryError: unknown) => {
        throw toProviderError(options.operation, retryError);
      });
    }
  }

  withMailbox<Result>(
    path: string,
    options: RunOptions,
    work: MailboxWork<Result>,
  ): Promise<Result> {
    return this.run(options, async (client) => {
      const lock = await client.getMailboxLock(path);
      try {
        const mailbox = client.mailbox;
        if (mailbox === false) {
          throw new Error(`Mailbox ${path} is not open`);
        }
        return await work(client, mailbox);
      } finally {
        lock.release();
      }
    });
  }

  async close(): Promise<void> {
    const pending = this.connecting;
    if (pending) {
      await pending.catch(() => null);
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

  private async acquireOrFail(operation: string): Promise<ImapFlow> {
    return this.acquire().catch((error: unknown) => {
      throw toProviderError(`${operation} (connect)`, error);
    });
  }

  private async open(): Promise<ImapFlow> {
    const client = await this.factory.create();
    client.on('error', () => {
      this.drop(client);
    });
    client.on('close', () => {
      this.drop(client);
    });
    await client.connect().catch((error: unknown) => {
      client.close();
      throw error;
    });
    this.client = client;
    return client;
  }

  private drop(client: ImapFlow): void {
    if (this.client !== client) {
      return;
    }
    this.client = null;
    client.close();
  }
}
