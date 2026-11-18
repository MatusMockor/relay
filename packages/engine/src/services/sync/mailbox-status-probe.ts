import type { RemoteMailboxStatus } from '../../model/remote-mail';
import type { Logger } from '../../ports/logger';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { SyncContext } from './sync-context';

export type MailboxStatuses = ReadonlyMap<string, RemoteMailboxStatus>;

export class MailboxStatusProbe {
  constructor(private readonly logger: Logger) {}

  async probe(context: SyncContext, paths: readonly string[]): Promise<MailboxStatuses> {
    const statuses = new Map<string, RemoteMailboxStatus>();
    for (const path of paths) {
      const status = await context.provider.status(path).catch((error: unknown) => {
        this.logger.warn('Reading a mailbox status failed', {
          accountId: context.account.id,
          path,
          error: errorMessage(error),
        });
        return null;
      });
      if (status !== null) {
        statuses.set(path, status);
      }
    }
    return statuses;
  }
}
