import { composeOverlay } from '../../state/compose-overlay';
import { AccountSquare, FolderIcon, Icon, Kbd, Status } from '@relay/ui';
import { useLabels, useTasks } from '../../data/hooks/use-mail-queries';
import { useSessionStore } from '../../session/session-store';
import { setUi, useUiStore } from '../../state/ui-store';
import { accountLike, useAccountsModel } from '../mail/use-accounts-model';
import { AccountFolders } from './AccountFolders';
import { FolderEditHost } from './edit/FolderEditHost';
import { SystemFolders } from './SystemFolders';
import { rectOf } from './rect';
import { accountCount } from '../../lib/text';
import { SidebarUpdateControl } from '../updates/SidebarUpdateControl';
import { VersionButton } from '../updates/VersionButton';

function ModeStatus() {
  const services = useSessionStore((state) => state.services);
  const realtime = useSessionStore((state) => state.realtime);
  const open = () => {
    setUi({
      overlay: {
        kind: 'settings',
        section: services?.mode === 'synced' ? 'server' : 'ai',
        adding: false,
      },
    });
  };
  if (services?.mode === 'synced') {
    const host = services.serverUrl === null ? 'server' : new URL(services.serverUrl).host;
    return (
      <button type="button" onClick={open} title="Nastavenia servera">
        <Status
          tone={realtime === 'online' ? 'ok' : realtime === 'connecting' ? 'busy' : 'off'}
          label={`${host} ${realtime === 'online' ? 'online' : 'offline'}`}
        />
      </button>
    );
  }
  return (
    <button type="button" onClick={open} title="Nastavenia">
      <Status
        tone={services?.mode === 'local' ? 'ok' : 'off'}
        label={services?.mode === 'local' ? 'Lokálny režim' : 'Ukážkový režim'}
      />
    </button>
  );
}

export function FolderSidebar({ width }: { readonly width: number }) {
  const model = useAccountsModel();
  const scope = useUiStore((state) => state.scope);
  const labels = useLabels();
  const tasks = useTasks();
  const name = model.current?.displayName ?? 'Všetky účty';
  const sub = model.current?.email ?? accountCount(model.accounts.length);
  const scopedLabels = (labels.data ?? []).filter(
    (label) => scope === 'all' || label.accountId === scope,
  );
  const openTasks = (tasks.data?.items ?? []).some((task) => task.state !== 'done');
  return (
    <nav className="fold" id="fold" aria-label="Priečinky" style={{ width }}>
      <div className="fold-bar" />
      <div className="acct">
        <button
          type="button"
          className="acct-btn"
          aria-haspopup="menu"
          aria-label={`Účet: ${name}. Prepnúť účet`}
          onClick={(event) => {
            setUi({ overlay: { kind: 'accounts', anchor: rectOf(event.currentTarget) } });
          }}
        >
          <AccountSquare
            account={model.current === null ? null : accountLike(model.current)}
            all={model.accounts.map(accountLike)}
          />
          <span className="t">
            <b>{name}</b>
            <small>{sub}</small>
          </span>
          <Icon name="down" />
        </button>
        <button
          type="button"
          className="hide"
          title="Skryť panel ([)"
          aria-label="Skryť panel"
          onClick={() => {
            setUi({ leftUser: false });
          }}
        >
          <FolderIcon name="side" />
        </button>
      </div>
      <button
        type="button"
        className="compose"
        onClick={() => {
          setUi({ overlay: composeOverlay({}) });
        }}
      >
        <FolderIcon name="pen" />
        Napísať
        <Kbd keys={['C']} />
      </button>
      <SystemFolders showTasks={openTasks} />
      <AccountFolders labels={scopedLabels} />
      <FolderEditHost />
      <div className="fold-foot">
        <div className="fold-foot-meta">
          <ModeStatus />
          <VersionButton />
        </div>
        <SidebarUpdateControl />
      </div>
    </nav>
  );
}
