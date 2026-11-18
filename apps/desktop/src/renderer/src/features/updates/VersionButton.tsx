import { openAbout } from './open-about';
import { useAppInfo } from './use-app-info';

export function VersionButton() {
  const info = useAppInfo();
  const name = info?.name ?? 'Relay';
  const label = info === null ? name : `${name} ${info.version}`;
  return (
    <button type="button" className="app-ver" title={`O aplikácii ${name}`} onClick={openAbout}>
      {label}
    </button>
  );
}
