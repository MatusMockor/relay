import { Icon } from '@relay/ui';

const LABEL = 'Skontrolovať aktualizácie';

export function UpdateCheckButton({
  checking,
  onCheck,
}: {
  readonly checking: boolean;
  readonly onCheck: () => void;
}) {
  return (
    <button
      type="button"
      className={checking ? 'app-ver-check spinning' : 'app-ver-check'}
      title={LABEL}
      aria-label={LABEL}
      disabled={checking}
      onClick={onCheck}
    >
      <Icon name="refresh" size={12} />
    </button>
  );
}
