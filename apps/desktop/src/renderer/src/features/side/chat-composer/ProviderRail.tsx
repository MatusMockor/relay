import type { AiRunnerKind } from '@relay/shared';
import { ProviderLogo } from '@relay/ui';
import { RUNNERS } from '../../ai/model-choice/model-choice';
import { RUNNER_LABELS } from '../../ai/model-choice/model-labels';

export interface ProviderRailProps {
  readonly listed: AiRunnerKind;
  readonly onList: (runner: AiRunnerKind) => void;
}

export function ProviderRail({ listed, onList }: ProviderRailProps) {
  return (
    <div className="mdlm-rail" role="group" aria-label="Poskytovateľ">
      {RUNNERS.map((runner) => (
        <button
          key={runner}
          type="button"
          aria-pressed={runner === listed}
          aria-label={RUNNER_LABELS[runner]}
          title={RUNNER_LABELS[runner]}
          className={runner === listed ? 'rb on' : 'rb'}
          onClick={() => {
            onList(runner);
          }}
        >
          <ProviderLogo runner={runner} size={20} />
        </button>
      ))}
    </div>
  );
}
