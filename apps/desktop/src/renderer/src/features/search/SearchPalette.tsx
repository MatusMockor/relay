import { Icon, Sheet } from '@relay/ui';
import { useRef } from 'react';
import { LocalSection } from './LocalSection';
import { paletteKeyHandler } from './palette-keys';
import { RecentSearches } from './RecentSearches';
import { closeSearchPalette } from './search-actions';
import type { SearchResult } from './search-session';
import { SearchChips } from './SearchChips';
import { SearchKeys } from './SearchKeys';
import { SearchResultRow } from './SearchResultRow';
import { ServerSection } from './ServerSection';
import { useActiveOptionScroll } from './use-active-option-scroll';
import { useSearchPalette } from './use-search-palette';

const LABEL = 'Hľadať v pošte';

export function SearchPalette() {
  const model = useSearchPalette();
  const input = useRef<HTMLInputElement>(null);
  const now = new Date();
  const searching = model.query.trim() !== '';
  const activeId = model.active === undefined ? undefined : model.optionId(model.active);
  useActiveOptionScroll(model.followActive ? activeId : undefined);
  const row = (result: SearchResult) => {
    const entry = model.entries.find((item) => item.key === `${result.source}:${result.key}`);
    return (
      <SearchResultRow
        key={`${result.source}:${result.key}`}
        id={entry === undefined ? '' : model.optionId(entry)}
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
    <Sheet
      placement="top"
      label={LABEL}
      className="pal spal"
      onClose={closeSearchPalette}
      onKey={paletteKeyHandler(model, () => input.current)}
    >
      <div className="pal-in">
        <Icon name="search" />
        <input
          ref={input}
          autoFocus
          role="combobox"
          aria-expanded={model.entries.length > 0}
          aria-controls={model.listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          placeholder="Hľadať v pošte…"
          autoComplete="off"
          spellCheck={false}
          aria-label={LABEL}
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
      <div className="pal-body" id={model.listId} role="listbox" aria-label="Výsledky hľadania">
        {searching ? (
          <>
            <LocalSection query={model.query} results={model.results} renderRow={row} />
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
            optionId={model.optionId}
            onHover={model.hover}
            onPick={model.pick}
          />
        )}
      </div>
      <SearchKeys />
    </Sheet>
  );
}
