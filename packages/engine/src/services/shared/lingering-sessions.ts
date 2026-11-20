import type { AccountId, MailAccount } from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { IntervalTimer } from '../../ports/interval-timer';
import type { MailProvider } from '../../ports/mail-provider';
import { KeyedSerializer } from './keyed-serializer';
import type { MailProviderSessions } from './mail-provider-sessions';

export interface LingeringSessionsDeps {
  readonly sessions: MailProviderSessions;
  readonly clock: Clock;
  readonly timer: IntervalTimer;
  readonly idleMs: number;
}

interface Lingering {
  readonly provider: MailProvider;
  usedAt: number;
}

export class LingeringSessions {
  private readonly open = new Map<AccountId, Lingering>();
  private readonly serializer = new KeyedSerializer();
  private stopSweep: (() => void) | null = null;

  constructor(private readonly deps: LingeringSessionsDeps) {}

  with<Result>(
    account: MailAccount,
    work: (provider: MailProvider) => Promise<Result>,
  ): Promise<Result> {
    return this.serializer.run(account.id, async () => {
      const lingering = await this.acquire(account);
      try {
        return await work(lingering.provider);
      } catch (error) {
        await this.discard(account.id);
        throw error;
      } finally {
        lingering.usedAt = this.now();
      }
    });
  }

  openCount(): number {
    return this.open.size;
  }

  closeAccount(accountId: AccountId): Promise<void> {
    return this.serializer.run(accountId, () => this.discard(accountId));
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.open.keys()].map((accountId) => this.closeAccount(accountId)));
  }

  private async acquire(account: MailAccount): Promise<Lingering> {
    const existing = this.open.get(account.id);
    if (existing !== undefined) {
      return existing;
    }
    const provider = await this.deps.sessions.open(account);
    const lingering = { provider, usedAt: this.now() };
    this.open.set(account.id, lingering);
    this.ensureSweep();
    return lingering;
  }

  private async discard(accountId: AccountId): Promise<void> {
    const lingering = this.open.get(accountId);
    if (lingering === undefined) {
      return;
    }
    this.open.delete(accountId);
    this.stopWhenEmpty();
    await lingering.provider.close().catch(() => undefined);
  }

  private ensureSweep(): void {
    if (this.stopSweep !== null) {
      return;
    }
    this.stopSweep = this.deps.timer.repeat(this.sweepInterval(), () => this.sweep());
  }

  private stopWhenEmpty(): void {
    if (this.open.size > 0 || this.stopSweep === null) {
      return;
    }
    this.stopSweep();
    this.stopSweep = null;
  }

  private async sweep(): Promise<void> {
    const cutoff = this.now() - this.deps.idleMs;
    const idle = [...this.open.entries()].filter(([, lingering]) => lingering.usedAt <= cutoff);
    await Promise.all(
      idle.map(([accountId]) =>
        this.serializer.run(accountId, async () => {
          const current = this.open.get(accountId);
          if (current === undefined || current.usedAt > this.now() - this.deps.idleMs) {
            return;
          }
          await this.discard(accountId);
        }),
      ),
    );
  }

  private sweepInterval(): number {
    return Math.max(1000, Math.floor(this.deps.idleMs / 4));
  }

  private now(): number {
    return this.deps.clock.now().getTime();
  }
}
