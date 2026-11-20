import type { MailAccount } from '@relay/shared';
import { Button } from '@relay/ui';
import { useState } from 'react';
import { forwardAddressIssue } from './forward-address';

export interface ForwardAddressFormProps {
  readonly account: MailAccount | undefined;
  readonly current: string | null;
  readonly onPick: (to: string) => void;
}

export function ForwardAddressForm({ account, current, onPick }: ForwardAddressFormProps) {
  const [draft, setDraft] = useState(current ?? '');
  const [issue, setIssue] = useState<string | null>(null);
  return (
    <form
      className="au-fwd"
      aria-label="Preposlať na adresu"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const to = draft.trim();
        const found = forwardAddressIssue(to, account);
        setIssue(found);
        if (found === null) {
          onPick(to);
        }
      }}
    >
      <div className="grp">Preposlať na adresu</div>
      <label className="fld">
        <input
          type="email"
          aria-label="E-mailová adresa na preposlanie"
          aria-invalid={issue !== null}
          placeholder="meno@firma.sk"
          autoComplete="off"
          spellCheck={false}
          maxLength={320}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setIssue(null);
          }}
        />
      </label>
      {issue === null ? (
        <p className="au-hint">Prepošle sa každý nový mail, ktorý pravidlo zachytí.</p>
      ) : (
        <p className="au-hint bad" role="alert">
          {issue}
        </p>
      )}
      <Button type="submit" variant="primary">
        Uložiť adresu
      </Button>
    </form>
  );
}
