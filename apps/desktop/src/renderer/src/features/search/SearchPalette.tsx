import { Icon, Overlay } from '@relay/ui';
import { type ReactNode, useRef } from 'react';
import { setUi } from '../../state/ui-store';
import { isControlTarget } from '../keyboard/focus-target';
import { localCount } from './local-count';
import { RecentSearches } from './RecentSearches';
import { closeSearchPalette } from './search-actions';
import type { SearchResult } from './search-session';
import { SearchChips } from './SearchChips';
import { SearchKeys } from './SearchKeys';
import { SearchResultRow } from './SearchResultRow';
import { ServerSection } from './ServerSection';
import { type SearchPaletteModel, useSearchPalette } from './use-search-palette';

const keyHandler =
  (model: SearchPaletteModel, input: () => HTMLInputElement | null) =>
  (event: KeyboardEvent): boolean => {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'k') {
      event.preventDefault();
      setUi({ overlay: { kind: 'palette' } });
      return true;
    }
    if (mod && key === 'f') {
      event.preventDefault();
      input()?.select();
      return true;
    }
    const down = event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n');
    const up = event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p');
    if (down || up) {
      event.preventDefault();
      model.move(down ? 1 : -1);
      return true;
    }
    if (event.key !== 'Enter' || isControlTarget(event.target)) {
      return false;
    }
    event.preventDefault();
    if (mod) {
      model.showAll();
      return true;
    }
    model.pick(model.active);
    return true;
  };

function LocalSection({
  model,
  row,
}: {
  readonly model: SearchPaletteModel;
  readonly row: (result: SearchResult) => ReactNode;
}) {
  const { local, localReady } = model.results;
  return (
    <section aria-label="Maily">
      <div className="spal-sec">
        <Icon name="mail" size={14} />
        Maily
        {localReady ? <span className="r">{localCount(local.length)}</span> : null}
      </div>
      {local.map(row)}
      {localReady && local.length === 0 ? (
        <div className="pal-empty">{`Lokálne nič pre „${model.query.trim()}“.`}</div>
      ) : null}
    </section>
  );
}

export function SearchPalette() {
  const model = useSearchPalette();
  const input = useRef<HTMLInputElement>(null);
  const now = new Date();
  const searching = model.query.trim() !== '';
  const row = (result: SearchResult) => {
    const entry = model.entries.find((item) => item.key === `${result.source}:${result.key}`);
    return (
      <SearchResultRow
        key={`${result.source}:${result.key}`}
        result={result}
        query={model.query}
        now={now}
        active={entry !== undefined && entry === model.active}
        onHover={() => {
          if (entry !== undefined) {
            model.hover(entry);
          }
        }}
        onPick={() => {
          model.pick(entry);
        }}
      />
    );
  };
  return (
    <Overlay onClose={closeSearchPalette} onKey={keyHandler(model, () => input.current)}>
      <div className="surface pal spal" role="dialog" aria-modal="true" aria-label="Hľadať v pošte">
        <div className="pal-in">
          <Icon name="search" />
          <input
            ref={input}
            autoFocus
            placeholder="Hľadať v pošte…"
            autoComplete="off"
            spellCheck={false}
            aria-label="Hľadať v pošte"
            value={model.query}
            onChange={(event) => {
              model.setQuery(event.target.value);
            }}
          />
          <span className="spal-esc" aria-hidden="true">
            Esc
          </span>
        </div>
        <SearchChips filters={model.filters} onToggle={model.toggle} />
        <div className="pal-body" role="listbox" aria-label="Výsledky hľadania">
          {searching ? (
            <>
              <LocalSection model={model} row={row} />
              <ServerSection
                state={model.results.serverState}
                results={model.results.server}
                renderRow={row}
              />
            </>
          ) : (
            <RecentSearches
              entries={model.entries}
              active={model.active}
              onHover={model.hover}
              onPick={model.pick}
            />
          )}
        </div>
        <SearchKeys />
      </div>
    </Overlay>
  );
}
