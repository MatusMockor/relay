import { Field } from '@relay/ui';
import { useEffect, useState } from 'react';

export interface RuleNameProps {
  readonly name: string;
  readonly disabled: boolean;
  readonly onRename: (name: string) => void;
  readonly onDraft?: (draft: string | null) => void;
  readonly noun?: string;
  readonly fieldLabel?: string;
}

export function RuleName({
  name,
  disabled,
  onRename,
  onDraft,
  noun = 'pravidlo',
  fieldLabel = 'Názov pravidla',
}: RuleNameProps) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    onDraft?.(draft);
  }, [draft, onDraft]);
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
        aria-label={`Premenovať ${noun} ${name}`}
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
      label={fieldLabel}
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
