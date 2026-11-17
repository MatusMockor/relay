import { AI_EFFORT_LABELS, AI_MODEL_CATALOG, defaultAiModel, effortsFor } from '@relay/shared';
import { type AnchorRect, Icon, Popover } from '@relay/ui';
import {
  type ModelChoice,
  RUNNER_LABELS,
  RUNNERS,
  withEffort,
  withModel,
  withRunner,
} from './model-choice';

interface Option {
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly pick: () => void;
}

function OptionGroup({ title, options }: { readonly title: string; readonly options: Option[] }) {
  return (
    <div role="group" aria-label={title}>
      <div className="grp">{title}</div>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="menuitemradio"
          aria-checked={option.checked}
          className={option.checked ? 'pi cur' : 'pi'}
          onClick={option.pick}
        >
          <span className="lb">
            {option.label}
            {option.hint === undefined ? null : <small>{option.hint}</small>}
          </span>
          {option.checked ? (
            <span className="ck">
              <Icon name="check" />
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export interface ModelPickerMenuProps {
  readonly anchor: AnchorRect;
  readonly value: ModelChoice;
  readonly onChange: (next: ModelChoice) => void;
  readonly onClose: () => void;
}

export function ModelPickerMenu({ anchor, value, onChange, onClose }: ModelPickerMenuProps) {
  const efforts = effortsFor(value.runner, value.model);
  const runners = RUNNERS.map((runner) => ({
    key: runner,
    label: RUNNER_LABELS[runner],
    checked: runner === value.runner,
    pick: () => {
      onChange(withRunner(value, runner));
    },
  }));
  const models = [
    {
      key: 'default',
      label: 'Predvolený',
      hint: defaultAiModel(value.runner).label,
      checked: value.model === null,
      pick: () => {
        onChange(withModel(value, null));
      },
    },
    ...AI_MODEL_CATALOG[value.runner].map((model) => ({
      key: model.id,
      label: model.label,
      checked: model.id === value.model,
      pick: () => {
        onChange(withModel(value, model.id));
      },
    })),
  ];
  const effortOptions = [
    {
      key: 'default',
      label: 'Predvolené',
      checked: value.effort === null,
      pick: () => {
        onChange(withEffort(value, null));
      },
    },
    ...efforts.map((effort) => ({
      key: effort,
      label: AI_EFFORT_LABELS[effort],
      checked: effort === value.effort,
      pick: () => {
        onChange(withEffort(value, effort));
      },
    })),
  ];
  return (
    <Popover anchor={anchor} label="Model AI" role="menu" className="mdlp" onClose={onClose}>
      <OptionGroup title="Poskytovateľ" options={runners} />
      <div className="sepl" />
      <OptionGroup title="Model" options={models} />
      {efforts.length === 0 ? null : (
        <>
          <div className="sepl" />
          <OptionGroup title="Úsilie" options={effortOptions} />
        </>
      )}
    </Popover>
  );
}
