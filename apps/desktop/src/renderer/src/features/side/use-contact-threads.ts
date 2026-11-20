import type { ThreadSummary } from '@relay/shared';
import { useThreadScan, useThreadScans } from '../../data/hooks/thread-scan';
import { useSplits } from '../../data/hooks/use-mail-queries';
import { useAccountsModel } from '../mail/use-accounts-model';
import { newestFirst } from './contact-model';
import { inboxThreadsOf, senderInboxScans, uniqueThreads } from './sender-inbox-scans';

export type ContactMatcher = (item: ThreadSummary, own: ReadonlySet<string>) => boolean;

export interface ContactThreads {
  readonly own: ReadonlySet<string>;
  readonly threads: readonly ThreadSummary[];
}

export const useOwnAddresses = (): ReadonlySet<string> => {
  const model = useAccountsModel();
  return new Set(model.accounts.map((account) => account.email.toLowerCase()));
};

const useInboxThreads = (): ThreadSummary[] => {
  const results = useThreadScans(senderInboxScans(useSplits().data ?? []));
  return inboxThreadsOf(results.flatMap((result) => result.data?.items ?? []));
};

export const useContactThreads = (matches: ContactMatcher): ContactThreads => {
  const own = useOwnAddresses();
  const inbox = useInboxThreads();
  const done = useThreadScan({ view: 'done' });
  const archive = useThreadScan({ view: 'archive' });
  const threads = uniqueThreads([
    ...inbox,
    ...(done.data?.items ?? []),
    ...(archive.data?.items ?? []),
  ])
    .filter((item) => matches(item, own))
    .sort(newestFirst);
  return { own, threads };
};
