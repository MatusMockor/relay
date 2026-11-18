import { useEffect, useState } from 'react';

export interface LabelNameInputProps {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => Promise<boolean>;
}

export function LabelNameInput({ label, value, onCommit }: LabelNameInputProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const commit = () => {
    const next = draft.trim();
    if (next === '' || next === value) {
      setDraft(value);
      return;
    }
    void onCommit(next).then((saved) => {
      if (!saved) {
        setDraft(value);
      }
    });
  };
  return (
    <span className="fld lbl-name-fld">
      <input
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        maxLength={100}
        value={draft}
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
            event.stopPropagation();
            setDraft(value);
          }
        }}
      />
    </span>
  );
}
