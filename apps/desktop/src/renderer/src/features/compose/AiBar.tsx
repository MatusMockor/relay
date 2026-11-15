import { Spark } from '@relay/ui';
import { useEffect, useRef } from 'react';

export interface AiBarProps {
  readonly placeholder: string;
  readonly chips: readonly string[];
  readonly onRun: (instruction: string) => void;
  readonly onClose: () => void;
}

export function AiBar({ placeholder, chips, onRun, onClose }: AiBarProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="cmp-ai">
      <Spark />
      <input
        ref={ref}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-label="Pokyn pre AI"
        onKeyDown={(event) => {
          const mod = event.metaKey || event.ctrlKey;
          if (event.key === 'Escape' || (mod && event.key.toLowerCase() === 'j')) {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            onRun(event.currentTarget.value.trim());
          }
        }}
      />
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          className="chipb"
          onClick={() => {
            onRun(chip);
          }}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

export function BusyOverlay({ label }: { readonly label: string }) {
  return (
    <div className="cmp-busy" role="status">
      <Spark />
      <span>{label}</span>
    </div>
  );
}
