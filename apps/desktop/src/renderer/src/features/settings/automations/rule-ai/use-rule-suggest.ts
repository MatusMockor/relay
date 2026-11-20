import type { AccountId, MailAccount, Mailbox, RuleSuggestion } from '@relay/shared';
import { useEffect, useRef, useState } from 'react';
import { useClient } from '../../../../data/hooks/services-context';
import { useAccountsMailboxes, useLabels } from '../../../../data/hooks/use-mail-queries';
import type { Unsubscribe } from '../../../../data/MailClient';
import { runRuleSuggest } from './run-rule-suggest';
import { suggestCatalog } from './suggest-catalog';

export interface RuleSuggestState {
  readonly ready: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly suggest: (sentence: string, onDone: (suggestion: RuleSuggestion) => void) => void;
}

export const useRuleSuggest = (
  accountId: AccountId | null,
  accounts: readonly MailAccount[],
): RuleSuggestState => {
  const client = useClient();
  const labels = useLabels();
  const mailboxes = useAccountsMailboxes(accounts.map((account) => account.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef<Unsubscribe | null>(null);
  const ready = !labels.isPending && mailboxes.every((query) => !query.isPending);
  useEffect(
    () => () => {
      running.current?.();
    },
    [],
  );
  const suggest = (sentence: string, onDone: (suggestion: RuleSuggestion) => void) => {
    const text = sentence.trim();
    if (!ready || busy || text === '') {
      return;
    }
    const byAccount = new Map<AccountId, readonly Mailbox[]>(
      accounts.map((account, index) => [account.id, mailboxes[index]?.data ?? []]),
    );
    setBusy(true);
    setError(null);
    running.current = runRuleSuggest(
      client,
      {
        sentence: text,
        accountId,
        accounts: suggestCatalog(accounts, labels.data ?? [], byAccount),
      },
      {
        onDone: (suggestion) => {
          running.current = null;
          setBusy(false);
          onDone(suggestion);
        },
        onError: (message) => {
          running.current = null;
          setBusy(false);
          setError(message);
        },
      },
    );
  };
  return { ready, busy, error, suggest };
};
