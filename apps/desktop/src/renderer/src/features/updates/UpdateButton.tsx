import { cx } from '@relay/ui';
import { useId } from 'react';
import type { UpdateButtonAction, UpdateButtonView } from './update-button-view';
import { UpdateIcon } from './UpdateIcon';
import { UpdateProgressRing } from './UpdateProgressRing';
import { UpdateTooltip } from './UpdateTooltip';

export function UpdateButton({
  view,
  onAction,
  onReveal,
}: {
  readonly view: UpdateButtonView;
  readonly onAction: (action: UpdateButtonAction) => void;
  readonly onReveal: () => void;
}) {
  const detailId = useId();
  const { action } = view;
  const checking = view.kind === 'checking';
  return (
    <div className="upd" onPointerEnter={onReveal}>
      <button
        type="button"
        className={cx('upd-btn', view.kind)}
        aria-label={view.label}
        aria-describedby={view.detail === null ? undefined : detailId}
        aria-disabled={action === null && !checking ? true : undefined}
        disabled={checking}
        onFocus={onReveal}
        onClick={() => {
          if (action === null) {
            return;
          }
          onAction(action);
        }}
      >
        {view.percent !== null && <UpdateProgressRing percent={view.percent} />}
        <UpdateIcon kind={view.kind} />
      </button>
      <UpdateTooltip label={view.label} detail={view.detail} detailId={detailId} />
    </div>
  );
}
