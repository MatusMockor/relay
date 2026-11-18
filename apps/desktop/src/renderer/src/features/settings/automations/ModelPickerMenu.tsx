import { AI_EFFORT_LABELS, AI_MODEL_CATALOG, effortsFor } from '@relay/shared';
import { type AnchorRect, Popover, ProviderLogo } from '@relay/ui';
import {
  effectiveModel,
  type ModelChoice,
  RUNNERS,
  withEffort,
  withModel,
  withRunner,
} from '../../ai/model-choice/model-choice';
import { RUNNER_LABELS } from '../../ai/model-choice/model-labels';

export interface ModelPickerMenuProps {
  readonly anchor: AnchorRect;
  readonly value: ModelChoice;
  readonly onChange: (next: ModelChoice) => void;
  readonly onClose: () => void;
}

export function ModelPickerMenu({ anchor, value, onChange, onClose }: ModelPickerMenuProps) {
  const model = effectiveModel(value);
  const efforts = effortsFor(value.runner, model);
  return (
    <Popover
      anchor={anchor}
      align="right"
      label="Model AI"
      className="mdlp"
      width={300}
      onClose={onClose}
    >
      <div className="seg" role="radiogroup" aria-label="Poskytovateľ">
        {RUNNERS.map((runner) => (
          <button
            key={runner}
            type="button"
            role="radio"
            aria-checked={runner === value.runner}
            className={runner === value.runner ? 'on' : undefined}
            onClick={() => {
              onChange(withRunner(value, runner));
            }}
          >
            <ProviderLogo runner={runner} size={14} />
            {RUNNER_LABELS[runner]}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Model">
        <div className="grp">Model</div>
        {AI_MODEL_CATALOG[value.runner].map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === model}
            className={option.id === model ? 'pi on' : 'pi'}
            onClick={() => {
              onChange(withModel(value, option.id));
            }}
          >
            {option.label}
            {option.id === model ? <small>✓</small> : null}
          </button>
        ))}
      </div>
      {efforts.length === 0 ? null : (
        <>
          <div className="sepl" />
          <div className="grp">Reasoning</div>
          <div className="effs" role="radiogroup" aria-label="Reasoning">
            {efforts.map((effort) => (
              <button
                key={effort}
                type="button"
                role="radio"
                aria-checked={effort === value.effort}
                className={effort === value.effort ? 'on' : undefined}
                onClick={() => {
                  onChange(withEffort(value, effort));
                }}
              >
                {AI_EFFORT_LABELS[effort]}
              </button>
            ))}
          </div>
        </>
      )}
    </Popover>
  );
}
