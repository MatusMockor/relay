import { Icon } from '@relay/ui';
import { type RefObject, useEffect, useRef } from 'react';
import { resultCount } from '../../lib/text';
import { setUi, useUiStore } from '../../state/ui-store';
import { closeSearch } from '../mail/navigation';
import { SearchKey } from './SearchKey';
import { useSearchTotal } from './use-search-total';

function SearchActions({ input }: { readonly input: RefObject<HTMLInputElement | null> }) {
  const query = useUiStore((state) => state.query);
  const total = useSearchTotal();
  if (query === '') {
    return <SearchKey label="Esc" />;
  }
  return (
    <>
      {total === null ? null : <span className="srch-count">{resultCount(total)}</span>}
      <button
        type="button"
        className="srch-clear"
        aria-label="Vymazať hľadanie"
        title="Vymazať hľadanie"
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          setUi({ query: '' });
          input.current?.focus();
        }}
      >
        <Icon name="x" size={10} strokeWidth={2} />
      </button>
    </>
  );
}

export function SearchInput() {
  const query = useUiStore((state) => state.query);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <label className="srch-row">
      <Icon name="search" size={14} />
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
      <SearchActions input={ref} />
    </label>
  );
}
