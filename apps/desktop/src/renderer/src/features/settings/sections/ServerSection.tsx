import { Button, Status } from '@relay/ui';
import { useQuery } from '@tanstack/react-query';
import { describeError } from '../../../data/errors';
import { useAppContext } from '../../../data/hooks/services-context';
import { useSessionStore } from '../../../session/session-store';
import { showToast } from '../../../state/toast-store';
import { setUi } from '../../../state/ui-store';
import { SettingRow } from '../SettingRow';
import { SectionHeader } from '../SectionHeader';

export function ServerSection() {
  const { platform, session } = useAppContext();
  const services = useSessionStore((state) => state.services);
  const realtime = useSessionStore((state) => state.realtime);
  const device = useQuery({
    queryKey: ['device-settings'],
    queryFn: () => platform.deviceSettings(),
  });
  const saved = device.data?.savedServers ?? [];
  const active = services?.mode === 'synced' ? services.serverUrl : null;
  const connect = () => {
    setUi({ overlay: null });
    session.goTo('server', null);
  };
  return (
    <>
      <SectionHeader title="Server">
        Server synchronizuje poštu 24/7 a drží nastavenia pre všetky tvoje zariadenia. Adresa
        servera je nastavenie len tohto zariadenia.
      </SectionHeader>
      <SettingRow
        title="Režim"
        description={
          active === null
            ? 'Bez účtu, dáta ostávajú na tomto zariadení'
            : 'Prihlásený k serveru, dáta sa synchronizujú'
        }
      >
        <Status
          tone={active === null ? 'off' : realtime === 'online' ? 'ok' : 'busy'}
          label={
            active === null
              ? services?.mode === 'demo'
                ? 'Ukážkový'
                : 'Lokálny'
              : realtime === 'online'
                ? 'Online'
                : 'Pripájam…'
          }
        />
      </SettingRow>
      {saved.map((server) => (
        <SettingRow key={server.url} title={server.name} description={server.url}>
          {server.url === active ? (
            <Status tone="ok" label="Aktívny" />
          ) : (
            <Button
              onClick={() => {
                setUi({ overlay: null });
                session.switchServer(server.url).catch((error: unknown) => {
                  showToast(describeError(error));
                });
              }}
            >
              Prepnúť
            </Button>
          )}
        </SettingRow>
      ))}
      <div className="add-acc">
        <Button onClick={connect}>
          {active === null ? 'Pripojiť k serveru' : 'Pridať server'}
        </Button>
      </div>
    </>
  );
}
