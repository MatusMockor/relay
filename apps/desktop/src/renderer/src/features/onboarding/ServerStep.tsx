import { ServerUrlSchema } from '@relay/shared';
import { Button, Field, Kbd } from '@relay/ui';
import { useState } from 'react';
import { normalizeServerUrl } from '../../data/remote/ServerApi';
import { useAppContext } from '../../data/hooks/services-context';
import { OnboardingFrame } from './OnboardingFrame';

export const validateServerInput = (input: string): string | null => {
  if (input.trim() === '') {
    return 'Zadaj adresu servera, napríklad https://relay.domov.sk';
  }
  return ServerUrlSchema.safeParse(normalizeServerUrl(input)).success
    ? null
    : 'Adresa servera nie je platná. Použi tvar https://server.sk bez ? a #.';
};

export function ServerStep() {
  const { session } = useAppContext();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = () => {
    const invalid = validateServerInput(value);
    if (invalid !== null) {
      setError(invalid);
      return;
    }
    const url = normalizeServerUrl(value);
    setBusy(true);
    session
      .verifyServer(url)
      .catch(() => {
        setError(`Na adrese ${url} neodpovedá Relay server. Skontroluj adresu a či server beží.`);
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <OnboardingFrame
      title="Pripojiť k serveru"
      lead="Zadaj adresu svojho Relay servera. Overíme, či odpovedá, a potom sa prihlásiš alebo zaregistruješ."
      step={1}
      onBack={() => {
        session.goTo('welcome', null);
      }}
    >
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field
          label="Adresa servera"
          autoFocus
          inputMode="url"
          placeholder="https://relay.domov.sk"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
        />
        {error === null ? null : (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <div className="btns">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Overujem…' : 'Pokračovať'} <Kbd keys={['↵']} />
          </Button>
        </div>
      </form>
    </OnboardingFrame>
  );
}
