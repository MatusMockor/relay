import type { ThreadSummary } from '@relay/shared';
import { useThreadScan, useThreadScans } from '../../data/hooks/thread-scan';
import { useSplits } from '../../data/hooks/use-mail-queries';
import { useAccountsModel } from '../mail/use-accounts-model';
import { newestFirst } from './contact-model';

export type ContactMatcher = (item: ThreadSummary, own: ReadonlySet<string>) => boolean;

export interface ContactThreads {
  readonly own: ReadonlySet<string>;
  readonly threads: readonly ThreadSummary[];
}

export const useOwnAddresses = (): ReadonlySet<string> => {
  const model = useAccountsModel();
  return new Set(model.accounts.map((account) => account.email.toLowerCase()));
};

const useExclusiveSplitInboxes = (): ThreadSummary[] => {
  const splits = (useSplits().data ?? []).filter((split) => split.exclusive);
  const results = useThreadScans(
    splits.map((split) => ({ view: 'inbox' as const, splitId: split.id })),
  );
  return results.flatMap((result) => result.data?.items ?? []);
};

const unique = (threads: readonly ThreadSummary[]): ThreadSummary[] => [
  ...new Map(threads.map((thread) => [thread.id, thread])).values(),
];

export const useContactThreads = (matches: ContactMatcher): ContactThreads => {
  const own = useOwnAddresses();
  const inbox = useThreadScan({ view: 'inbox' });
  const done = useThreadScan({ view: 'done' });
  const splitInboxes = useExclusiveSplitInboxes();
  const threads = unique([
    ...(inbox.data?.items ?? []),
    ...splitInboxes,
    ...(done.data?.items ?? []),
  ])
    .filter((item) => matches(item, own))
    .sort(newestFirst);
  return { own, threads };
};
