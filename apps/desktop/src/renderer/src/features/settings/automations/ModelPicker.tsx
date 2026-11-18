import { AI_EFFORT_LABELS } from '@relay/shared';
import { type AnchorRect, Icon } from '@relay/ui';
import { useState } from 'react';
import { type ModelChoice, modelLabel, RUNNER_LABELS } from './model-choice';
import { ModelPickerMenu } from './ModelPickerMenu';
import { ProviderIcon } from './ProviderIcon';

export interface ModelPickerProps {
  readonly value: ModelChoice;
  readonly onChange: (next: ModelChoice) => void;
  readonly onOpen?: () => void;
  readonly disabled?: boolean;
}

export function ModelPicker({ value, onChange, onOpen, disabled = false }: ModelPickerProps) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const effort = value.effort === null ? 'Predvolené' : AI_EFFORT_LABELS[value.effort];
  const summary = [RUNNER_LABELS[value.runner], modelLabel(value), effort].join(', ');
  return (
    <>
      <button
        type="button"
        className="mpb"
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-label={`Model AI: ${summary}`}
        disabled={disabled}
        onClick={(event) => {
          onOpen?.();
          setAnchor(event.currentTarget.getBoundingClientRect());
        }}
      >
        <ProviderIcon runner={value.runner} />
        {modelLabel(value)}
        <span className="ef">{effort}</span>
        <Icon name="down" size={12} />
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
