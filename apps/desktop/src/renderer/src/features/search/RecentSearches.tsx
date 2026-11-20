import { Icon } from '@relay/ui';
import { PaletteOption } from './PaletteOption';
import type { PaletteEntry } from './use-search-palette';

export interface RecentSearchesProps {
  readonly entries: readonly PaletteEntry[];
  readonly active: PaletteEntry | undefined;
  readonly optionId: (entry: PaletteEntry) => string;
  readonly onHover: (entry: PaletteEntry) => void;
  readonly onPick: (entry: PaletteEntry) => void;
}

export function RecentSearches({
  entries,
  active,
  optionId,
  onHover,
  onPick,
}: RecentSearchesProps) {
  if (entries.length === 0) {
    return (
      <div className="pal-empty">
        Hľadaj podľa odosielateľa, predmetu alebo textu. Staršiu poštu prehľadám aj na serveri.
      </div>
    );
  }
  return (
    <div role="group" aria-label="Nedávne hľadania">
      <div className="spal-sec">Nedávne hľadania</div>
      {entries.map((entry) =>
        entry.kind === 'recent' ? (
          <PaletteOption
            key={entry.key}
            id={optionId(entry)}
            active={entry === active}
            className="spal-cmd"
            onHover={() => {
              onHover(entry);
            }}
            onPick={() => {
              onPick(entry);
            }}
          >
            <Icon name="search" size={14} />
            {entry.query}
          </PaletteOption>
        ) : null,
      )}
    </div>
  );
}
