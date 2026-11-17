import { type AnchorRect, Icon } from '@relay/ui';
import { useState } from 'react';
import { describeChoice, type ModelChoice } from './model-choice';
import { ModelPickerMenu } from './ModelPickerMenu';

export interface ModelPickerProps {
  readonly value: ModelChoice;
  readonly onChange: (next: ModelChoice) => void;
  readonly disabled?: boolean;
}

export function ModelPicker({ value, onChange, disabled = false }: ModelPickerProps) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const summary = describeChoice(value);
  return (
    <>
      <button
        type="button"
        className="btn mdlp-trigger"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        aria-label={`Model AI: ${summary}`}
        disabled={disabled}
        onClick={(event) => {
          setAnchor(event.currentTarget.getBoundingClientRect());
        }}
      >
        <span>{summary}</span>
        <Icon name="down" />
      </button>
      {anchor === null ? null : (
        <ModelPickerMenu
          anchor={anchor}
          value={value}
          onChange={onChange}
          onClose={() => {
            setAnchor(null);
          }}
        />
      )}
    </>
  );
}
