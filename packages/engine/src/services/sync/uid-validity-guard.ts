import type { Mailbox } from '@relay/shared/domain';
import { UidValidityChangedError } from '../../errors';
import type { Logger } from '../../ports/logger';
import type { SyncContext } from './sync-context';

export const skipOnUidValidityChange = async <Result>(
  logger: Logger,
  context: SyncContext,
  mailbox: Mailbox,
  operation: () => Promise<Result>,
): Promise<Result | null> => {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof UidValidityChangedError)) {
      throw error;
    }
    logger.warn('Mailbox UIDVALIDITY changed during the sync, retrying next time', {
      accountId: context.account.id,
      mailboxId: mailbox.id,
    });
    return null;
  }
};
