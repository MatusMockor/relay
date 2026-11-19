import { Icon, IconButton, type StrokeIconName } from '@relay/ui';
import { MOD } from '../../lib/platform-keys';
import type { HistoryDirection } from '../history/navigation-history';
import { stepHistory } from '../history/step-history';
import { useCanStepHistory } from '../history/use-can-step-history';

interface HistoryButtonProps {
  readonly direction: HistoryDirection;
  readonly label: string;
  readonly keyName: string;
  readonly icon: StrokeIconName;
}

const BUTTONS: readonly HistoryButtonProps[] = [
  { direction: 'back', label: 'Späť', keyName: '[', icon: 'arrowLeft' },
  { direction: 'forward', label: 'Dopredu', keyName: ']', icon: 'arrowRight' },
];

function HistoryButton({ direction, label, keyName, icon }: HistoryButtonProps) {
  const enabled = useCanStepHistory(direction);
  return (
    <IconButton
      label={label}
      shortcut={[`${MOD}${keyName}`]}
      disabled={!enabled}
      onClick={() => {
        stepHistory(direction);
      }}
    >
      <Icon name={icon} />
    </IconButton>
  );
}

export function HistoryNav() {
  return (
    <div className="h-nav">
      {BUTTONS.map((button) => (
        <HistoryButton key={button.direction} {...button} />
      ))}
    </div>
  );
}
