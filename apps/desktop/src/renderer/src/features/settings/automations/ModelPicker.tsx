import { AI_EFFORT_LABELS } from '@relay/shared';
import { type AnchorRect, cx, Icon, ProviderLogo } from '@relay/ui';
import { useState } from 'react';
import { inheritsSettings, type ModelChoice } from '../../ai/model-choice/model-choice';
import {
  modelLabel,
  RUNNER_LABELS,
  SETTINGS_CHOICE_LABEL,
  shortModelLabel,
} from '../../ai/model-choice/model-labels';
import { ModelPickerMenu } from './ModelPickerMenu';

export interface ModelPickerProps {
  readonly value: ModelChoice;
  readonly onChange: (next: ModelChoice) => void;
  readonly onOpen?: () => void;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly warning?: string | null;
  readonly settingsOption?: boolean;
}

export function ModelPicker({
  value,
  onChange,
  onOpen,
  disabled = false,
  label = 'Model AI',
  warning = null,
  settingsOption = false,
}: ModelPickerProps) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const inherits = settingsOption && inheritsSettings(value);
  const effort = value.effort === null ? 'Predvolené' : AI_EFFORT_LABELS[value.effort];
  const detail = warning ?? effort;
  const summary = inherits
    ? SETTINGS_CHOICE_LABEL
    : [RUNNER_LABELS[value.runner], modelLabel(value), detail].join(', ');
  return (
    <>
      <button
        type="button"
        className="mpb"
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-label={`${label}: ${summary}`}
        disabled={disabled}
        onClick={(event) => {
          onOpen?.();
          setAnchor(event.currentTarget.getBoundingClientRect());
        }}
      >
        {inherits ? <Icon name="gear" size={14} /> : <ProviderLogo runner={value.runner} />}
        {inherits ? SETTINGS_CHOICE_LABEL : shortModelLabel(value)}
        {inherits ? null : <span className={cx('ef', warning !== null && 'warn')}>· {detail}</span>}
        <Icon name="down" size={12} />
      </button>
      {anchor === null ? null : (
        <ModelPickerMenu
          anchor={anchor}
          value={value}
          onChange={onChange}
          settingsOption={settingsOption}
          onClose={() => {
            setAnchor(null);
          }}
        />
      )}
    </>
  );
}
