import { useEffect, useState } from 'react';

export interface InstructionsBoxProps {
  readonly value: string | null;
  readonly disabled: boolean;
  readonly onSave: (value: string | null) => void;
  readonly onEngage: () => void;
}

export function InstructionsBox({ value, disabled, onSave, onEngage }: InstructionsBoxProps) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => {
    setText(value ?? '');
  }, [value]);
  return (
    <label className="ins">
      <i>Inštrukcie pre AI</i>
      <textarea
        value={text}
        rows={2}
        maxLength={2_000}
        disabled={disabled}
        placeholder="Napríklad: Úlohu vytvor, len ak odo mňa niekto niečo chce."
        onFocus={onEngage}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onBlur={() => {
          const next = text.trim() === '' ? null : text.trim();
          if (next === value) {
            return;
          }
          onSave(next);
        }}
      />
    </label>
  );
}
