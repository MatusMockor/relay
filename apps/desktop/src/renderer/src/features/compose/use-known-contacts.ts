import type { Address, ThreadPage } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../data/hooks/query-keys';
import { fuzzyScore } from '../../lib/text';
import { useAccountsModel } from '../mail/use-accounts-model';
import { collectKnownContacts } from './known-contacts';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export const useKnownContacts = () => {
  const queryClient = useQueryClient();
  const model = useAccountsModel();
  const own = model.accounts.map((account) => account.email);
  return (query: string): Address[] => {
    const pages = queryClient.getQueriesData<ThreadPage>({ queryKey: queryKeys.threadLists() });
    const all = collectKnownContacts(
      pages.map(([, page]) => page),
      own,
    );
    const matches =
      query.trim() === ''
        ? all.slice(0, 5)
        : all
            .map((address) => ({
              address,
              score: fuzzyScore(query, `${address.name ?? ''} ${address.email}`),
            }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((item) => item.address);
    const raw = query.trim();
    if (EMAIL_PATTERN.test(raw) && !matches.some((address) => address.email === raw)) {
      return [...matches, { name: null, email: raw }];
    }
    return matches;
  };
};
