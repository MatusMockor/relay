import type { ProviderChange } from '../../model/pending-work';
import type { MailProvider } from '../../ports/mail-provider';

type StoreChange = Exclude<ProviderChange, { kind: 'move' }>;

const mutation = <Name>(name: Name, value: boolean) =>
  value ? { add: [name], remove: [] } : { add: [], remove: [name] };

export const writeStoreChange = (
  provider: MailProvider,
  path: string,
  uids: readonly number[],
  change: StoreChange,
): Promise<void> => {
  switch (change.kind) {
    case 'flag':
      return provider.setFlags(path, uids, mutation(change.flag, change.value));
    case 'keyword':
      return provider.setKeywords(path, uids, mutation(change.keyword, change.value));
    case 'label':
      return provider.setLabels(path, uids, mutation(change.label, change.value));
  }
};
