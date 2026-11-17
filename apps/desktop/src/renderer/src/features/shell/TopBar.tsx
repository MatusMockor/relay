import { Icon, IconButton, Kbd, Spark } from '@relay/ui';
import { useEffect, useRef } from 'react';
import { MOD } from '../../lib/platform-keys';
import { setUi, useUiStore } from '../../state/ui-store';
import { closeSearch, openRight, openSearch, toggleRight } from '../mail/navigation';
import { FolderTitle } from './FolderTitle';
import { SplitTabs } from './SplitTabs';
import { ThreadNav } from './ThreadNav';

function SearchBox() {
  const query = useUiStore((state) => state.query);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <label className="qbox">
      <Icon name="search" />
      <input
        ref={ref}
        id="q"
        placeholder="Hľadať v zozname…"
        autoComplete="off"
        spellCheck={false}
        aria-label="Hľadať v zozname"
        value={query}
        onChange={(event) => {
          setUi({ query: event.target.value });
        }}
        onBlur={() => {
          if (useUiStore.getState().query.trim() === '') {
            setUi({ searchOpen: false });
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeSearch();
            return;
          }
          if (event.key === 'Enter' || event.key === 'ArrowDown') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      <Kbd keys={['Esc']} />
    </label>
  );
}

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
          label="Zobraziť priečinky ([)"
          onClick={() => {
            setUi({ leftUser: true });
          }}
        >
          <Icon name="panelLeft" />
        </IconButton>
      )}
      {inThread ? <ThreadNav /> : inbox ? <SplitTabs /> : <FolderTitle />}
      <div className="right">
        {searchOpen && !inThread ? (
          <SearchBox />
        ) : (
          <button type="button" className="srch" title="Hľadať (/)" onClick={openSearch}>
            <Icon name="search" size={14} />
            <span>Hľadať</span>
            <Kbd keys={['/']} />
          </button>
        )}
        <IconButton
          className="ai"
          label="Spýtať sa AI (A)"
          onClick={() => {
            openRight('ai');
          }}
        >
          <Spark />
        </IconButton>
        <IconButton
          label={rightOpen ? 'Skryť pravý panel (I)' : 'Zobraziť pravý panel (I)'}
          active={rightOpen}
          onClick={toggleRight}
        >
          <Icon name="panelRight" />
        </IconButton>
        <button
          type="button"
          className="me-btn"
          title={`Nastavenia (${MOD},)`}
          aria-label="Nastavenia"
          onClick={() => {
            setUi({ overlay: { kind: 'settings', section: 'accounts', adding: false } });
          }}
        >
          <span className="av sm c1">JA</span>
        </button>
      </div>
    </div>
  );
}
