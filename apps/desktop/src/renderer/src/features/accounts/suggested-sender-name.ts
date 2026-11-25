import { type MailAccount, oldestAccount } from '@relay/shared';
import { useAccounts } from '../../data/hooks/use-mail-queries';
import { useSessionStore } from '../../session/session-store';

export const optionalText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export const suggestSenderName = (
  accounts: readonly MailAccount[],
  userName: string | null,
): string => {
  const named = accounts.filter((account) => account.senderName !== null);
  const source = named.find((account) => account.isPrimary) ?? oldestAccount(named);
  return source?.senderName ?? userName ?? '';
};

export const useSuggestedSenderName = (): string => {
  const accounts = useAccounts();
  const user = useSessionStore((state) => state.user);
  return suggestSenderName(accounts.data ?? [], user?.displayName ?? null);
};
