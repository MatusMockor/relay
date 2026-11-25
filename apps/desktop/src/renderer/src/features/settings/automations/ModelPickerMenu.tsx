import { AI_EFFORT_LABELS, AI_MODEL_CATALOG, defaultAiModel, effortsFor } from '@relay/shared';
import { type AnchorRect, Popover, ProviderLogo } from '@relay/ui';
import {
  effectiveModel,
  inheritsSettings,
  type ModelChoice,
  RUNNERS,
  withEffort,
  withModel,
  withRunner,
  withSelection,
  withSettings,
} from '../../ai/model-choice/model-choice';
import { RUNNER_LABELS, SETTINGS_CHOICE_LABEL } from '../../ai/model-choice/model-labels';

export interface ModelPickerMenuProps {
  readonly anchor: AnchorRect;
  readonly value: ModelChoice;
  readonly onChange: (next: ModelChoice) => void;
  readonly onClose: () => void;
  readonly settingsOption?: boolean;
}

export function ModelPickerMenu({
  anchor,
  value,
  onChange,
  onClose,
  settingsOption = false,
}: ModelPickerMenuProps) {
  const inherits = settingsOption && inheritsSettings(value);
  const model = inherits ? null : effectiveModel(value);
  const efforts = model === null ? [] : effortsFor(value.runner, model);
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
            aria-checked={!inherits && runner === value.runner}
            className={!inherits && runner === value.runner ? 'on' : undefined}
            onClick={() => {
              onChange(
                inherits
                  ? withSelection(value, runner, defaultAiModel(runner).id)
                  : withRunner(value, runner),
              );
            }}
          >
            <ProviderLogo runner={runner} size={14} />
            {RUNNER_LABELS[runner]}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Model">
        <div className="grp">Model</div>
        {settingsOption ? (
          <button
            type="button"
            role="radio"
            aria-checked={inherits}
            className={inherits ? 'pi on' : 'pi'}
            onClick={() => {
              onChange(withSettings(value));
            }}
          >
            {SETTINGS_CHOICE_LABEL}
            {inherits ? <small>✓</small> : null}
          </button>
        ) : null}
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
