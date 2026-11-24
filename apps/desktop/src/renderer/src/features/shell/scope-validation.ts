import type { MailAccount } from '@relay/shared';
import { useEffect } from 'react';
import { useAccounts } from '../../data/hooks/use-mail-queries';
import { type AccountScope, type Folder, INBOX } from '../../state/folders';
import { setUi, useUiStore } from '../../state/ui-store';
import { appHistory } from '../history/app-history';
import { selectFolder, selectScope } from '../mail/navigation';

const isKnownScope = (scope: AccountScope, accounts: readonly MailAccount[]): boolean =>
  scope === 'all' || accounts.some((account) => account.id === scope);

const resetUnknownComposeScope = (accounts: readonly MailAccount[]): void => {
  const { overlay } = useUiStore.getState();
  if (overlay?.kind !== 'compose' || isKnownScope(overlay.scope, accounts)) {
    return;
  }
  setUi({ overlay: { ...overlay, scope: 'all' } });
};

const isKnownFolder = (folder: Folder, accounts: readonly MailAccount[]): boolean =>
  folder.kind !== 'mailbox' || accounts.some((account) => account.id === folder.accountId);

const useFolderValidation = (accounts: readonly MailAccount[] | undefined): void => {
  const folder = useUiStore((state) => state.folder);
  useEffect(() => {
    if (accounts === undefined || isKnownFolder(folder, accounts)) {
      return;
    }
    appHistory.quietly(() => {
      selectFolder(INBOX);
    });
  }, [accounts, folder]);
};

export const useScopeValidation = (): void => {
  const { data } = useAccounts();
  const scope = useUiStore((state) => state.scope);
  useFolderValidation(data);
  useEffect(() => {
    if (data === undefined) {
      return;
    }
    resetUnknownComposeScope(data);
    if (isKnownScope(scope, data)) {
      return;
    }
    appHistory.quietly(() => {
      selectScope('all');
    });
  }, [data, scope]);
};
