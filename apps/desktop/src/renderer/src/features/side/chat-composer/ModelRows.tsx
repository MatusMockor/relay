import { AI_MODEL_CATALOG, type AiRunnerKind } from '@relay/shared';
import { cx, ProviderLogo } from '@relay/ui';
import { RUNNER_LABELS, shortLabel } from '../../ai/model-choice/model-labels';
import type { MenuItemProps } from './use-menu-cursor';

export interface ModelRowsProps {
  readonly runner: AiRunnerKind;
  readonly active: string | null;
  readonly cursor: number;
  readonly item: (index: number) => MenuItemProps;
  readonly onPick: (index: number) => void;
}

export function ModelRows({ runner, active, cursor, item, onPick }: ModelRowsProps) {
  return (
    <div className="mdlm-list" role="listbox" aria-label="Model">
      {AI_MODEL_CATALOG[runner].map((model, index) => (
        <button
          key={model.id}
          {...item(index)}
          type="button"
          role="option"
          aria-selected={model.id === active}
          className={cx('mrow', index === cursor && 'on', model.id === active && 'cur')}
          onClick={() => {
            onPick(index);
          }}
        >
          <span className="mrow-tx">
            <span className="nm">{shortLabel(model.label)}</span>
            <span className="pr">
              <ProviderLogo runner={runner} size={12} />
              {RUNNER_LABELS[runner]}
            </span>
          </span>
          {index < 9 ? <span className="kbd">{index + 1}</span> : null}
        </button>
      ))}
    </div>
  );
}
