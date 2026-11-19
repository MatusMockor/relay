import { Icon, IconButton, Spark, TooltipButton } from '@relay/ui';
import { MOD } from '../../lib/platform-keys';
import { setUi, useUiStore } from '../../state/ui-store';
import { openRight, toggleRight } from '../mail/navigation';
import { FolderTitle } from './FolderTitle';
import { HistoryNav } from './HistoryNav';
import { MeAvatar } from './MeAvatar';
import { SearchField } from './SearchField';
import { SplitTabs } from './SplitTabs';
import { ThreadNav } from './ThreadNav';

export function TopBar({ leftVisible }: { readonly leftVisible: boolean }) {
  const folder = useUiStore((state) => state.folder);
  const inThread = useUiStore((state) => state.openThreadId !== null);
  const searchOpen = useUiStore((state) => state.searchOpen);
  const rightOpen = useUiStore((state) => state.rightOpen);
  const inbox = folder.kind === 'inbox' || (folder.kind === 'view' && folder.view === 'tasks');
  return (
    <div className="a-top">
      {leftVisible ? null : (
        <IconButton
          className="lt-btn"
          label="Zobraziť priečinky"
          shortcut={['[']}
          onClick={() => {
            setUi({ leftUser: true });
          }}
        >
          <Icon name="panelLeft" />
        </IconButton>
      )}
      <HistoryNav />
      {inThread ? <ThreadNav /> : inbox ? <SplitTabs /> : <FolderTitle />}
      <div className="right">
        <SearchField open={searchOpen && !inThread} />
        <IconButton
          className="ai"
          label="Spýtať sa AI"
          shortcut={['A']}
          onClick={() => {
            openRight('ai');
          }}
        >
          <Spark />
        </IconButton>
        <IconButton
          label={rightOpen ? 'Skryť pravý panel' : 'Zobraziť pravý panel'}
          shortcut={['I']}
          active={rightOpen}
          onClick={toggleRight}
        >
          <Icon name="panelRight" />
        </IconButton>
        <TooltipButton
          className="me-btn"
          tip="Nastavenia"
          shortcut={[`${MOD},`]}
          aria-label="Nastavenia"
          onClick={() => {
            setUi({ overlay: { kind: 'settings', section: 'accounts', adding: false } });
          }}
        >
          <MeAvatar size="sm" />
        </TooltipButton>
      </div>
    </div>
  );
}
