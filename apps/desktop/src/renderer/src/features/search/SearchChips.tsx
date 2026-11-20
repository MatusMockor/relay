import type { SearchFilters } from '../../state/search-filters';
import { isChipOn, SEARCH_CHIPS, type SearchChip } from './search-filters';

export interface SearchChipsProps {
  readonly filters: SearchFilters;
  readonly onToggle: (chip: SearchChip) => void;
}

export function SearchChips({ filters, onToggle }: SearchChipsProps) {
  return (
    <div className="spal-chips" role="group" aria-label="Filtre hľadania">
      {SEARCH_CHIPS.map(({ chip, label }) => {
        const on = isChipOn(filters, chip);
        return (
          <button
            key={chip}
            type="button"
            className={on ? 'spal-chip on' : 'spal-chip'}
            aria-pressed={on}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => {
              onToggle(chip);
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
