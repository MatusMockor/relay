import type { TestConnectionResponse } from '@relay/shared';
import { Button, Field, Icon } from '@relay/ui';
import { presetFor } from '../../lib/provider-presets';
import { GoogleSignInButton } from './GoogleSignInButton';
import { ServerSettings } from './ServerSettings';
import { useAddAccount } from './use-add-account';

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
  const form = useAddAccount(onDone);
  const { values, set, check, error, busy } = form;
  const preset = presetFor(values.email);
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        void form.run('add');
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
      {preset?.note === undefined ? null : (
        <p className="note hint">
          <Icon name="info" size={14} />
          {preset.note}
        </p>
      )}
      <div className="fld-2 even">
        <div className="fld-n">
          <Field
            id="acc-f-senderName"
            label="Meno odosielateľa"
            placeholder="napr. Ján Novák"
            value={values.senderName}
            onChange={set('senderName')}
          />
          <p className="note">Uvidia ho príjemcovia v poli Od.</p>
        </div>
        <div className="fld-n">
          <Field
            id="acc-f-name"
            label="Názov účtu (nepovinné)"
            placeholder="napr. Práca"
            value={values.name}
            onChange={set('name')}
          />
          <p className="note">Len pre teba v aplikácii.</p>
        </div>
      </div>
      <ServerSettings
        values={values}
        open={form.serversOpen}
        onToggle={form.toggleServers}
        onChange={set}
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
            Zrušiť
          </Button>
        )}
        <Button
          onClick={() => {
            void form.run('test');
          }}
          disabled={busy !== null}
        >
          {busy === 'test' ? 'Testujem…' : 'Otestovať pripojenie'}
        </Button>
        <Button
          variant="primary"
          type="submit"
          disabled={busy !== null}
          title="Pridať účet (Enter)"
        >
          {busy === 'add' ? 'Pripájam…' : 'Pridať účet'}
        </Button>
      </div>
    </form>
  );
}
