import type { TestConnectionResponse } from '@relay/shared';
import { Button, Field, Kbd } from '@relay/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { presetFor } from '../../lib/provider-presets';
import { showToast } from '../../state/toast-store';
import {
  type AccountFormValues,
  EMPTY_ACCOUNT_FORM,
  validateAccountForm,
  withGuessedServers,
} from './account-form';
import { GoogleSignInButton } from './GoogleSignInButton';

export interface AddAccountFormProps {
  readonly onDone: () => void;
  readonly onCancel?: () => void;
}

const checkText = (result: TestConnectionResponse): string => {
  if (result.imap.ok && result.smtp.ok) {
    return 'Pripojenie funguje, IMAP aj SMTP odpovedajú.';
  }
  return [
    result.imap.ok ? null : `IMAP: ${result.imap.error ?? 'chyba'}`,
    result.smtp.ok ? null : `SMTP: ${result.smtp.error ?? 'chyba'}`,
  ]
    .filter((part) => part !== null)
    .join(' · ');
};

export function AddAccountForm({ onDone, onCancel }: AddAccountFormProps) {
  const client = useClient();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<AccountFormValues>(EMPTY_ACCOUNT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<TestConnectionResponse | null>(null);
  const [busy, setBusy] = useState<'test' | 'add' | null>(null);
  const preset = presetFor(values.email);
  const set = (field: keyof AccountFormValues) => (event: { target: { value: string } }) => {
    const next = { ...values, [field]: event.target.value };
    setValues(field === 'email' ? withGuessedServers(next, values.email) : next);
    setError(null);
    setCheck(null);
  };
  const run = async (kind: 'test' | 'add') => {
    const result = validateAccountForm(values);
    if (!result.ok) {
      setCheck(null);
      setError(result.error);
      document.getElementById(`acc-f-${result.field}`)?.focus();
      return;
    }
    setError(null);
    setCheck(null);
    setBusy(kind);
    try {
      if (kind === 'test') {
        setCheck(
          await client.testConnection({ settings: result.settings, password: values.password }),
        );
        return;
      }
      const account = await client.createAccount({
        provider: 'imap',
        email: values.email.trim(),
        password: values.password,
        settings: result.settings,
        displayName: values.name.trim() === '' ? undefined : values.name.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts() });
      showToast(`Účet ${account.displayName} je pripojený`);
      onDone();
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(null);
    }
  };
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        void run('add');
      }}
    >
      <GoogleSignInButton email={values.email} onDone={onDone} />
      <div className="divider">alebo IMAP</div>
      <Field
        id="acc-f-email"
        label="E-mail"
        inputMode="email"
        placeholder="meno@firma.sk"
        value={values.email}
        onChange={set('email')}
      />
      <Field
        id="acc-f-password"
        label="Heslo"
        type="password"
        placeholder="Heslo alebo heslo aplikácie"
        value={values.password}
        onChange={set('password')}
      />
      {preset?.note === undefined ? null : <p className="note">{preset.note}</p>}
      <div className="fld-2">
        <Field
          id="acc-f-imapHost"
          label="IMAP server"
          placeholder="imap.firma.sk"
          value={values.imapHost}
          onChange={set('imapHost')}
        />
        <Field
          id="acc-f-imapPort"
          label="Port"
          inputMode="numeric"
          value={values.imapPort}
          onChange={set('imapPort')}
        />
      </div>
      <div className="fld-2">
        <Field
          id="acc-f-smtpHost"
          label="SMTP server"
          placeholder="smtp.firma.sk"
          value={values.smtpHost}
          onChange={set('smtpHost')}
        />
        <Field
          id="acc-f-smtpPort"
          label="Port"
          inputMode="numeric"
          value={values.smtpPort}
          onChange={set('smtpPort')}
        />
      </div>
      <Field
        id="acc-f-name"
        label="Názov účtu (nepovinné)"
        placeholder="napr. Práca"
        value={values.name}
        onChange={set('name')}
      />
      {error === null ? null : (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {check === null ? null : (
        <p className={check.imap.ok && check.smtp.ok ? 'ok-note' : 'err'} role="status">
          {checkText(check)}
        </p>
      )}
      <div className="btns">
        {onCancel === undefined ? null : (
          <Button variant="ghost" onClick={onCancel}>
            Zrušiť <Kbd keys={['Esc']} />
          </Button>
        )}
        <Button
          onClick={() => {
            void run('test');
          }}
          disabled={busy !== null}
        >
          {busy === 'test' ? 'Testujem…' : 'Otestovať pripojenie'}
        </Button>
        <Button variant="primary" type="submit" disabled={busy !== null}>
          {busy === 'add' ? 'Pripájam…' : 'Pridať účet'} <Kbd keys={['↵']} />
        </Button>
      </div>
    </form>
  );
}
