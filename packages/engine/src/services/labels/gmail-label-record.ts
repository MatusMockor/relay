import type { AccountId, Label } from '@relay/shared/domain';
import type { IdGenerator } from '../../ports/id-generator';
import type { LabelRepository } from '../../ports/label-repository';
import { asNameConflict } from './label-name-policy';

export const upsertGmailLabel = async (
  labels: LabelRepository,
  ids: IdGenerator,
  accountId: AccountId,
  path: string,
  color: string | null,
): Promise<Label> => {
  const existing = await labels.findByRemoteName(accountId, 'gmail', path);
  return asNameConflict(
    labels.upsert({
      id: existing?.id ?? ids.generate('label'),
      accountId,
      name: path,
      color: color ?? existing?.color ?? null,
      kind: 'gmail',
      remoteName: path,
    }),
  );
};
