import { MAX_REPORTED_ACCOUNTS, type MailAccount, type ReportedAccount } from '@relay/shared';
import { useEffect, useMemo } from 'react';
import { useAccounts } from '../../data/hooks/use-mail-queries';
import { useAppContext } from '../../data/hooks/services-context';
import { useUiStore } from '../../state/ui-store';

const reportedAccounts = (accounts: readonly MailAccount[]): ReportedAccount[] =>
  accounts.slice(0, MAX_REPORTED_ACCOUNTS).map((account) => ({
    id: account.id,
    displayName: account.displayName,
    email: account.email,
    color: account.color,
    status: account.status,
    lastSyncedAt: account.lastSyncedAt,
  }));

export const useTrayReporter = (): void => {
  const { platform } = useAppContext();
  const scope = useUiStore((state) => state.scope);
  const { data } = useAccounts();
  const accounts = useMemo(() => reportedAccounts(data ?? []), [data]);
  useEffect(() => {
    platform.reportTray({ scope, accounts });
  }, [platform, scope, accounts]);
  useEffect(
    () => () => {
      platform.reportTray({ scope: 'all', accounts: [] });
    },
    [platform],
  );
};
