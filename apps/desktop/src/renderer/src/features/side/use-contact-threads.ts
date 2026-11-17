import type { ThreadSummary } from '@relay/shared';
import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { LIST_LIMIT, useSplits, useThreadList } from '../../data/hooks/use-mail-queries';
import { useAccountsModel } from '../mail/use-accounts-model';
import { type ContactKey, matchesContact, newestFirst } from './contact-model';

export interface ContactThreads {
  readonly own: ReadonlySet<string>;
  readonly threads: readonly ThreadSummary[];
}

export const useOwnAddresses = (): ReadonlySet<string> => {
  const model = useAccountsModel();
  return new Set(model.accounts.map((account) => account.email.toLowerCase()));
};

const useExclusiveSplitInboxes = (): ThreadSummary[] => {
  const client = useClient();
  const splits = (useSplits().data ?? []).filter((split) => split.exclusive);
  const results = useQueries({
    queries: splits.map((split) => {
      const params = { limit: LIST_LIMIT, view: 'inbox' as const, splitId: split.id };
      return {
        queryKey: queryKeys.threadList(params),
        queryFn: () => client.listThreads(params),
      };
    }),
  });
  return results.flatMap((result) => result.data?.items ?? []);
};

const unique = (threads: readonly ThreadSummary[]): ThreadSummary[] => [
  ...new Map(threads.map((thread) => [thread.id, thread])).values(),
];

export const useContactThreads = (key: ContactKey): ContactThreads => {
  const own = useOwnAddresses();
  const inbox = useThreadList({ view: 'inbox' });
  const done = useThreadList({ view: 'done' });
  const splitInboxes = useExclusiveSplitInboxes();
  const threads = unique([
    ...(inbox.data?.items ?? []),
    ...splitInboxes,
    ...(done.data?.items ?? []),
  ])
    .filter((item) => matchesContact(item, key, own))
    .sort(newestFirst);
  return { own, threads };
};
