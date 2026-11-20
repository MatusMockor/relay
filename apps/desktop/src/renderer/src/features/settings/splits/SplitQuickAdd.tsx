import type { SplitInput } from '@relay/shared';
import { Button, Field } from '@relay/ui';
import { useState } from 'react';
import { showToast } from '../../../state/toast-store';

const DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

export interface SplitQuickAddProps {
  readonly order: number;
  readonly disabled: boolean;
  readonly onAdd: (input: SplitInput) => void;
}

export function SplitQuickAdd({ order, disabled, onAdd }: SplitQuickAddProps) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const add = () => {
    if (disabled) {
      return;
    }
    if (name.trim() === '' || !DOMAIN.test(domain.trim().replace(/^@/, ''))) {
      showToast('Doplň názov splitu a doménu odosielateľa, napríklad firma.sk');
      return;
    }
    onAdd({
      accountId: null,
      name: name.trim(),
      order,
      match: 'any',
      rules: [{ type: 'fromDomain', domain: domain.trim().replace(/^@/, '') }],
      exceptions: [],
      exclusive: true,
      hideTasks: false,
    });
    setName('');
    setDomain('');
  };
  return (
    <div className="split-add">
      <Field
        label="Nový split"
        placeholder="napr. Klienti"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <Field
        label="Doména"
        placeholder="firma.sk"
        value={domain}
        onChange={(event) => {
          setDomain(event.target.value);
        }}
      />
      <Button onClick={add} disabled={disabled}>
        Pridať split
      </Button>
    </div>
  );
}
