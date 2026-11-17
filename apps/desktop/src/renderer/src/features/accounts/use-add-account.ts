import type { TestConnectionResponse } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { showToast } from '../../state/toast-store';
import {
  type AccountFormValues,
  EMPTY_ACCOUNT_FORM,
  validateAccountForm,
  withGuessedServers,
} from './account-form';
import { optionalText, useSuggestedSenderName } from './suggested-sender-name';

const SERVER_FIELDS: readonly (keyof AccountFormValues)[] = [
  'imapHost',
  'imapPort',
  'smtpHost',
  'smtpPort',
];

export const useAddAccount = (onDone: () => void) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const suggestedSender = useSuggestedSenderName();
  const [edited, setEdited] = useState<AccountFormValues>(EMPTY_ACCOUNT_FORM);
  const [senderTouched, setSenderTouched] = useState(false);
  const values = senderTouched ? edited : { ...edited, senderName: suggestedSender };
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<TestConnectionResponse | null>(null);
  const [busy, setBusy] = useState<'test' | 'add' | null>(null);
  const [serversOpen, setServersOpen] = useState(false);
  const revision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const set = (field: keyof AccountFormValues) => (event: { target: { value: string } }) => {
    revision.current += 1;
    if (field === 'senderName') {
      setSenderTouched(true);
    }
    const next = { ...values, [field]: event.target.value };
    setEdited(field === 'email' ? withGuessedServers(next, values.email) : next);
    setError(null);
    setCheck(null);
  };
  const reveal = (field: keyof AccountFormValues) => {
    if (SERVER_FIELDS.includes(field)) {
      flushSync(() => {
        setServersOpen(true);
      });
    }
    document.getElementById(`acc-f-${field}`)?.focus();
  };
  const run = async (kind: 'test' | 'add') => {
    const result = validateAccountForm(values);
    if (!result.ok) {
      setCheck(null);
      setError(result.error);
      reveal(result.field);
      return;
    }
    setError(null);
    setCheck(null);
    setBusy(kind);
    const started = revision.current;
    const current = () => mounted.current && (kind === 'add' || revision.current === started);
    try {
      if (kind === 'test') {
        const checked = await client.testConnection({
          settings: result.settings,
          password: values.password,
        });
        if (current()) {
          setCheck(checked);
        }
        return;
      }
      const account = await client.createAccount({
        provider: 'imap',
        email: values.email.trim(),
        password: values.password,
        settings: result.settings,
        displayName: optionalText(values.name) ?? undefined,
        senderName: optionalText(values.senderName),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts() });
      showToast(`Účet ${account.displayName} je pripojený`);
      if (mounted.current) {
        onDone();
      }
    } catch (failure) {
      if (current()) {
        setError(describeError(failure));
      }
    } finally {
      if (mounted.current) {
        setBusy(null);
      }
    }
  };
  const toggleServers = () => {
    setServersOpen((open) => !open);
  };
  return { values, set, run, error, check, busy, serversOpen, toggleServers };
};
