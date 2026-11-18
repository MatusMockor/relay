import { useAppContext } from '../../data/hooks/services-context';
import { openAbout } from './open-about';
import { useAppInfo } from './use-app-info';
import { describeUpdateStatus } from './update-status-view';
import { useUpdateStatus } from './use-update-status';

export function AppVersionStatus() {
  const { platform, now } = useAppContext();
  const info = useAppInfo();
  const status = useUpdateStatus(platform);
  const view = describeUpdateStatus(status, now?.() ?? new Date());
  const name = info?.name ?? 'Relay';
  const label = view.compact ?? (info === null ? name : `${name} ${info.version}`);
  if (view.canInstall) {
    return (
      <button
        type="button"
        className="app-ver accent"
        title={view.title}
        onClick={() => {
          platform.installUpdate().catch(() => undefined);
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
