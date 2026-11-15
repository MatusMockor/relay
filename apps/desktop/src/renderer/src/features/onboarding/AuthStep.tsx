import { EmailAddressSchema, PASSWORD_MIN_LENGTH } from '@relay/shared';
import { Button, Field, Kbd, Segmented } from '@relay/ui';
import { useState } from 'react';
import { MailClientError } from '../../data/errors';
import { useAppContext } from '../../data/hooks/services-context';
import { useSessionStore } from '../../session/session-store';
import { OnboardingFrame } from './OnboardingFrame';

type Mode = 'login' | 'register';

export interface AuthValues {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

export const validateAuth = (mode: Mode, values: AuthValues): string | null => {
  if (!EmailAddressSchema.safeParse(values.email.trim()).success) {
    return 'Zadaj platnú e-mailovú adresu.';
  }
  if (mode === 'register' && values.displayName.trim() === '') {
    return 'Doplň svoje meno.';
  }
  if (mode === 'register' && values.password.length < PASSWORD_MIN_LENGTH) {
    return `Heslo musí mať aspoň ${String(PASSWORD_MIN_LENGTH)} znakov.`;
  }
  return values.password === '' ? 'Doplň heslo.' : null;
};

const messageOf = (error: unknown, mode: Mode): string => {
  if (error instanceof MailClientError && error.code === 'unauthorized') {
    return 'Nesprávny e-mail alebo heslo.';
  }
  if (error instanceof MailClientError && error.code === 'conflict') {
    return 'Účet s týmto e-mailom už existuje. Prihlás sa.';
  }
  return error instanceof Error
    ? error.message
    : mode === 'login'
      ? 'Prihlásenie zlyhalo.'
      : 'Registrácia zlyhala.';
};

export function AuthStep() {
  const { session } = useAppContext();
  const serverUrl = useSessionStore((state) => state.pendingServerUrl);
  const [mode, setMode] = useState<Mode>('login');
  const [values, setValues] = useState<AuthValues>({ email: '', password: '', displayName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (field: keyof AuthValues) => (event: { target: { value: string } }) => {
    setValues({ ...values, [field]: event.target.value });
    setError(null);
  };
  const submit = () => {
    const invalid = validateAuth(mode, values);
    if (invalid !== null) {
      setError(invalid);
      return;
    }
    setBusy(true);
    session
      .authenticate(mode, {
        email: values.email.trim(),
        password: values.password,
        displayName: values.displayName.trim(),
      })
      .catch((failure: unknown) => {
        setError(messageOf(failure, mode));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <OnboardingFrame
      title={mode === 'login' ? 'Prihlásiť sa' : 'Vytvoriť účet'}
      lead={`Server ${serverUrl ?? ''} odpovedá. Toto zariadenie sa zaregistruje pod tvojím účtom.`}
      step={2}
      onBack={() => {
        session.goTo('server', null);
      }}
    >
      <Segmented<Mode>
        label="Prihlásenie alebo registrácia"
        value={mode}
        options={[
          { value: 'login', label: 'Mám účet' },
          { value: 'register', label: 'Nový účet' },
        ]}
        onChange={(next) => {
          setMode(next);
          setError(null);
        }}
      />
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {mode === 'register' ? (
          <Field
            label="Meno"
            placeholder="Ján Novák"
            value={values.displayName}
            onChange={set('displayName')}
          />
        ) : null}
        <Field
          label="E-mail"
          inputMode="email"
          placeholder="meno@domov.sk"
          value={values.email}
          onChange={set('email')}
        />
        <Field
          label="Heslo"
          type="password"
          placeholder={
            mode === 'register' ? `Aspoň ${String(PASSWORD_MIN_LENGTH)} znakov` : 'Heslo'
          }
          value={values.password}
          onChange={set('password')}
        />
        {error === null ? null : (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <div className="btns">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Moment…' : mode === 'login' ? 'Prihlásiť sa' : 'Zaregistrovať sa'}{' '}
            <Kbd keys={['↵']} />
          </Button>
        </div>
      </form>
    </OnboardingFrame>
  );
}
