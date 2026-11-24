import {
  isTaskSystemProviderAvailable,
  TASK_SYSTEM_PROVIDERS,
  type TaskSystemProvider,
} from '@relay/shared';
import { cx } from '@relay/ui';
import { PROVIDER_NAME } from '../../task-systems/provider-meta';
import { ProviderMark } from '../../task-systems/ProviderMark';

export interface ProviderPickerProps {
  readonly value: TaskSystemProvider;
  readonly disabled?: boolean;
  readonly onChange: (provider: TaskSystemProvider) => void;
}

export function ProviderPicker({ value, disabled = false, onChange }: ProviderPickerProps) {
  return (
    <div className="ts-providers" role="radiogroup" aria-label="Systém">
      {TASK_SYSTEM_PROVIDERS.map((provider) => {
        const available = isTaskSystemProviderAvailable(provider);
        const on = provider === value;
        return (
          <button
            key={provider}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled || !available}
            tabIndex={on ? 0 : -1}
            className={cx('ts-provider', on && 'on')}
            onClick={() => {
              onChange(provider);
            }}
          >
            <ProviderMark provider={provider} size={16} />
            <span>{PROVIDER_NAME[provider]}</span>
            {available ? null : <small>čoskoro</small>}
          </button>
        );
      })}
    </div>
  );
}
