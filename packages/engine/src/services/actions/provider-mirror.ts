import type { MailAccount } from '@relay/shared/domain';
import type { Logger } from '../../ports/logger';
import { errorMessage, type MailProviderSessions } from '../shared/mail-provider-sessions';
import type { PendingProviderOp } from '../shared/provider-ops';
import type { ProviderOpReplayer } from './provider-op-replayer';

export interface ProviderMirrorDeps {
  readonly sessions: MailProviderSessions;
  readonly replayer: ProviderOpReplayer;
  readonly logger: Logger;
}

export class ProviderMirror {
  constructor(private readonly deps: ProviderMirrorDeps) {}

  async apply(account: MailAccount, ops: readonly PendingProviderOp[]): Promise<void> {
    if (ops.length === 0) {
      return;
    }
    try {
      await this.deps.sessions.with(account, (provider) =>
        this.deps.replayer.replay(account, provider, ops),
      );
    } catch (error) {
      this.deps.logger.warn('Mirroring a thread action to the mail provider failed', {
        accountId: account.id,
        error: errorMessage(error),
      });
    }
  }
}
