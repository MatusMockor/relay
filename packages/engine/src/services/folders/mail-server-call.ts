import type { MailboxRole } from '@relay/shared/domain';
import { ProviderError } from '../../errors';

export type FolderOperation = 'create' | 'rename' | 'delete';

const FAILURES: Readonly<Record<FolderOperation, string>> = {
  create: 'vytvoriť',
  rename: 'premenovať',
  delete: 'zmazať',
};

const subjectOf = (role: MailboxRole | null): string => (role === 'label' ? 'Štítok' : 'Priečinok');

export const onMailServer = async <Result>(
  operation: FolderOperation,
  role: MailboxRole | null,
  work: () => Promise<Result>,
): Promise<Result> => {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof ProviderError)) {
      throw error;
    }
    const failure = `${subjectOf(role)} sa nepodarilo ${FAILURES[operation]} na serveri pošty`;
    throw new ProviderError(`${failure}: ${error.message}`, { cause: error });
  }
};
