import {
  isTaskSystemProviderAvailable,
  TASK_SYSTEM_PROVIDERS,
  type TaskSystemProvider,
} from '@relay/shared';
import { cx } from '@relay/ui';
import { type KeyboardEvent, useRef } from 'react';
import { PROVIDER_NAME } from '../../task-systems/provider-meta';
import { ProviderMark } from '../../task-systems/ProviderMark';
import { providerForKey } from './provider-keys';

export interface ProviderPickerProps {
  readonly value: TaskSystemProvider;
  readonly disabled?: boolean;
  readonly onChange: (provider: TaskSystemProvider) => void;
}

export function ProviderPicker({ value, disabled = false, onChange }: ProviderPickerProps) {
  const buttons = useRef(new Map<TaskSystemProvider, HTMLButtonElement>());
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = disabled ? null : providerForKey(event.key, value);
    if (next === null) {
      return;
    }
    event.preventDefault();
    onChange(next);
    buttons.current.get(next)?.focus();
  };
  return (
    <div className="ts-providers" role="radiogroup" aria-label="Systém" onKeyDown={onKeyDown}>
      {TASK_SYSTEM_PROVIDERS.map((provider) => {
        const available = isTaskSystemProviderAvailable(provider);
        const on = provider === value;
        return (
          <button
            key={provider}
            ref={(element) => {
              if (element === null) {
                buttons.current.delete(provider);
                return;
              }
              buttons.current.set(provider, element);
            }}
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
