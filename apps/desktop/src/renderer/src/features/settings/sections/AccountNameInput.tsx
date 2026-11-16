import { useEffect, useRef, useState } from 'react';

export interface AccountNameInputProps {
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly onCommit: (value: string) => void;
}

export function AccountNameInput({ label, value, placeholder, onCommit }: AccountNameInputProps) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) {
      setDraft(value);
    }
  }, [value]);
  const commit = () => {
    editing.current = false;
    if (draft.trim() === value.trim()) {
      setDraft(value);
      return;
    }
    onCommit(draft.trim());
  };
  return (
    <span className="fld acc-name-fld">
      <input
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={draft}
        onChange={(event) => {
          editing.current = true;
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
            event.stopPropagation();
            editing.current = false;
            setDraft(value);
          }
        }}
      />
    </span>
  );
}
