import { Field } from '@relay/ui';
import { useState } from 'react';

export interface RuleNameProps {
  readonly name: string;
  readonly disabled: boolean;
  readonly onRename: (name: string) => void;
}

export function RuleName({ name, disabled, onRename }: RuleNameProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const next = draft?.trim() ?? '';
    setDraft(null);
    if (next === '' || next === name) {
      return;
    }
    onRename(next);
  };
  if (draft === null) {
    return (
      <button
        type="button"
        aria-label={`Premenovať pravidlo ${name}`}
        disabled={disabled}
        onClick={() => {
          setDraft(name);
        }}
      >
        {name}
      </button>
    );
  }
  return (
    <Field
      label="Názov pravidla"
      value={draft}
      maxLength={100}
      autoFocus
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}
