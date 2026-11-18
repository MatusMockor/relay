import { RELAY_RELEASES_URL, RELAY_REPOSITORY_URL } from '@relay/shared';
import { Button } from '@relay/ui';
import { useAppContext } from '../../../data/hooks/services-context';
import { reportUpdateFailure } from '../../updates/report-update-failure';
import { describeUpdateStatus } from '../../updates/update-status-view';
import { useAppInfo } from '../../updates/use-app-info';
import { useUpdateStatus } from '../../updates/use-update-status';
import { SectionHeader } from '../SectionHeader';
import { SettingRow } from '../SettingRow';
import { SettingsGroup } from '../SettingsGroup';

export function AboutSection() {
  const { platform, now } = useAppContext();
  const info = useAppInfo();
  const status = useUpdateStatus(platform);
  const view = describeUpdateStatus(status, now?.() ?? new Date());
  const name = info?.name ?? 'Relay';
  return (
    <>
      <SectionHeader title="O aplikácii">
        AI mailový klient, ktorý beží lokálne alebo cez vlastný server.
      </SectionHeader>
      <SettingRow title={name} description={`Verzia ${info?.version ?? '…'}`} />
      <SettingsGroup title="Aktualizácie" />
      <span className="sr-only" role="status">
        {view.announcement}
      </span>
      <SettingRow title={view.title} description={view.detail ?? undefined}>
        {view.canInstall ? (
          <Button
            variant="primary"
            onClick={() => {
              platform.installUpdate().catch(reportUpdateFailure);
            }}
          >
            Reštartovať a aktualizovať
          </Button>
        ) : (
          <Button
            disabled={!view.canCheck}
            onClick={() => {
              platform.checkForUpdates().catch(reportUpdateFailure);
            }}
          >
            Skontrolovať aktualizácie
          </Button>
        )}
      </SettingRow>
      <SettingsGroup title="Odkazy" />
      <SettingRow title="GitHub" description="Zdrojový kód a hlásenie chýb.">
        <Button
          onClick={() => {
            platform.openExternal(RELAY_REPOSITORY_URL);
          }}
        >
          Otvoriť GitHub
        </Button>
      </SettingRow>
      <SettingRow title="Poznámky k vydaniam" description="Čo je nové v každej verzii.">
        <Button
          onClick={() => {
            platform.openExternal(RELAY_RELEASES_URL);
          }}
        >
          Otvoriť poznámky
        </Button>
      </SettingRow>
    </>
  );
}
