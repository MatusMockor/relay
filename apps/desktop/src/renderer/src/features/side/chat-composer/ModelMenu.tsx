import { AI_MODEL_CATALOG, type AiRunnerKind } from '@relay/shared';
import { type AnchorRect, Popover } from '@relay/ui';
import { useState } from 'react';
import {
  effectiveModel,
  type ModelChoice,
  withSelection,
} from '../../ai/model-choice/model-choice';
import { ModelRows } from './ModelRows';
import { ProviderRail } from './ProviderRail';
import { useMenuCursor } from './use-menu-cursor';

export interface ModelMenuProps {
  readonly anchor: AnchorRect;
  readonly value: ModelChoice;
  readonly onChange: (next: ModelChoice) => void;
  readonly onClose: () => void;
}

const activeIn = (value: ModelChoice, runner: AiRunnerKind): string | null =>
  runner === value.runner ? effectiveModel(value) : null;

const cursorFor = (value: ModelChoice, runner: AiRunnerKind): number =>
  Math.max(
    0,
    AI_MODEL_CATALOG[runner].findIndex((model) => model.id === activeIn(value, runner)),
  );

export function ModelMenu({ anchor, value, onChange, onClose }: ModelMenuProps) {
  const [listed, setListed] = useState(value.runner);
  const models = AI_MODEL_CATALOG[listed];
  const pick = (index: number) => {
    const model = models[index];
    if (model === undefined) {
      return;
    }
    onClose();
    onChange(withSelection(value, listed, model.id));
  };
  const menu = useMenuCursor({
    count: models.length,
    initial: cursorFor(value, listed),
    numbered: true,
    onPick: pick,
  });
  return (
    <Popover
      anchor={anchor}
      side="above"
      label="Výber modelu"
      className="mdlm"
      width={300}
      onClose={onClose}
      onKey={menu.onKey}
    >
      <div ref={menu.body} className="mdlm-body" tabIndex={-1}>
        <ProviderRail
          listed={listed}
          onList={(runner) => {
            setListed(runner);
            menu.setCursor(cursorFor(value, runner));
          }}
        />
        <ModelRows
          runner={listed}
          active={activeIn(value, listed)}
          cursor={menu.cursor}
          item={menu.item}
          onPick={pick}
        />
      </div>
    </Popover>
  );
}
