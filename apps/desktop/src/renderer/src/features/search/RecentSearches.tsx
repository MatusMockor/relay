import { Icon } from '@relay/ui';
import type { PaletteEntry } from './use-search-palette';

export interface RecentSearchesProps {
  readonly entries: readonly PaletteEntry[];
  readonly active: PaletteEntry | undefined;
  readonly onHover: (entry: PaletteEntry) => void;
  readonly onPick: (entry: PaletteEntry) => void;
}

export function RecentSearches({ entries, active, onHover, onPick }: RecentSearchesProps) {
  if (entries.length === 0) {
    return (
      <div className="pal-empty">
        Hľadaj podľa odosielateľa, predmetu alebo textu. Staršiu poštu prehľadám aj na serveri.
      </div>
    );
  }
  return (
    <section aria-label="Nedávne hľadania">
      <div className="spal-sec">Nedávne hľadania</div>
      {entries.map((entry) =>
        entry.kind === 'recent' ? (
          <button
            key={entry.key}
            type="button"
            role="option"
            aria-selected={entry === active}
            className={entry === active ? 'spal-cmd on' : 'spal-cmd'}
            onMouseMove={() => {
              onHover(entry);
            }}
            onClick={() => {
              onPick(entry);
            }}
          >
            <Icon name="search" size={14} />
            {entry.query}
          </button>
        ) : null,
      )}
    </section>
  );
}
