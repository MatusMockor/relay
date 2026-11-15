import { Avatar, Button } from '@relay/ui';
import { describeError } from '../../../data/errors';
import { useAppContext } from '../../../data/hooks/services-context';
import { useSessionStore } from '../../../session/session-store';
import { showToast } from '../../../state/toast-store';
import { setUi } from '../../../state/ui-store';
import { SettingRow } from '../SettingRow';

export function AccountSection() {
  const { session } = useAppContext();
  const services = useSessionStore((state) => state.services);
  const user = useSessionStore((state) => state.user);
  if (services?.mode !== 'synced') {
    return (
      <>
        <h2>Účet</h2>
        <p className="lead">
          Používaš Relay bez účtu. Pošta aj nastavenia ostávajú len na tomto zariadení.
        </p>
        <SettingRow
          title="Zaregistrovať sa"
          description="Registrácia na tvojom serveri zapne synchronizáciu medzi zariadeniami a AI na serveri."
        >
          <Button
            variant="primary"
            onClick={() => {
              setUi({ overlay: null });
              session.goTo('server', null);
            }}
          >
            Zaregistrovať sa
          </Button>
        </SettingRow>
      </>
    );
  }
  return (
    <>
      <h2>Účet</h2>
      <p className="lead">Prihlásený používateľ na serveri {services.serverUrl}.</p>
      <SettingRow title={user?.displayName ?? 'Používateľ'} description={user?.email ?? ''}>
        <Avatar name={user?.displayName ?? '?'} seed={user?.email} />
      </SettingRow>
      <SettingRow
        title="Odhlásiť sa"
        description="Toto zariadenie stratí prístup, kým sa znova neprihlásiš."
      >
        <Button
          variant="danger"
          onClick={() => {
            setUi({ overlay: null });
            session.logout().catch((error: unknown) => {
              showToast(`Odhlásenie zlyhalo: ${describeError(error)}`);
            });
          }}
        >
          Odhlásiť
        </Button>
      </SettingRow>
    </>
  );
}
