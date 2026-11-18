import { useAppContext } from '../../data/hooks/services-context';
import { openAbout } from './open-about';
import { reportUpdateFailure } from './report-update-failure';
import type { UpdateStatusView } from './update-status-view';

export function VersionButton({
  name,
  label,
  view,
}: {
  readonly name: string;
  readonly label: string;
  readonly view: UpdateStatusView;
}) {
  const { platform } = useAppContext();
  if (view.canInstall) {
    return (
      <button
        type="button"
        className="app-ver accent"
        title={view.title}
        onClick={() => {
          platform.installUpdate().catch(reportUpdateFailure);
        }}
      >
        {label}
      </button>
    );
  }
  return (
    <button type="button" className="app-ver" title={`O aplikácii ${name}`} onClick={openAbout}>
      {label}
    </button>
  );
}
