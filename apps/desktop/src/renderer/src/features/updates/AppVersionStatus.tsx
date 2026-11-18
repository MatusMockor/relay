import { useAppContext } from '../../data/hooks/services-context';
import { UpdateCheckButton } from './UpdateCheckButton';
import { useAppInfo } from './use-app-info';
import { useUpdateCheck } from './use-update-check';
import { describeUpdateStatus } from './update-status-view';
import { useUpdateStatus } from './use-update-status';
import { VersionButton } from './VersionButton';

export function AppVersionStatus() {
  const { platform, now } = useAppContext();
  const info = useAppInfo();
  const status = useUpdateStatus(platform);
  const view = describeUpdateStatus(status, now?.() ?? new Date());
  const { feedback, check } = useUpdateCheck(platform, status);
  const name = info?.name ?? 'Relay';
  const label = view.compact ?? feedback ?? (info === null ? name : `${name} ${info.version}`);
  const checking = status?.kind === 'checking';
  const checkable = view.canCheck || checking;
  return (
    <div className="app-ver-row">
      <VersionButton name={name} label={label} view={view} />
      {checkable && <UpdateCheckButton checking={checking} onCheck={check} />}
      {checkable && (
        <span className="sr-only" role="status">
          {feedback}
        </span>
      )}
    </div>
  );
}
