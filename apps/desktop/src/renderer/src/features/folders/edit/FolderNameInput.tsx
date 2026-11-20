import { FolderIcon } from '@relay/ui';
import { type CSSProperties, useEffect, useRef, useState } from 'react';

interface FolderNameInputProps {
  readonly initial: string;
  readonly label: string;
  readonly depth: number;
  readonly onSubmit: (name: string) => Promise<boolean>;
  readonly onClose: () => void;
}

const depthStyle = (depth: number): CSSProperties => ({ ['--depth' as string]: depth });

export function FolderNameInput({
  initial,
  label,
  depth,
  onSubmit,
  onClose,
}: FolderNameInputProps) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const submit = async () => {
    const name = value.trim();
    if (name === '' || name === initial) {
      onClose();
      return;
    }
    setBusy(true);
    const saved = await onSubmit(name);
    if (!mounted.current) {
      return;
    }
    setBusy(false);
    if (saved) {
      onClose();
      return;
    }
    input.current?.focus();
  };
  return (
    <form
      className="ft-row ft-edit"
      style={depthStyle(depth)}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <span className="ft-tw" aria-hidden="true" />
      <span className="f on">
        <FolderIcon name="folder" />
        <input
          ref={input}
          autoFocus
          className="ft-input"
          aria-label={label}
          placeholder={label}
          value={value}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          onFocus={(event) => {
            event.currentTarget.select();
          }}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
          onBlur={() => {
            if (!busy) {
              onClose();
            }
          }}
        />
      </span>
    </form>
  );
}
