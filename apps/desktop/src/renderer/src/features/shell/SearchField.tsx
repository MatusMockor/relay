import { Icon } from '@relay/ui';
import { MOD } from '../../lib/platform-keys';
import { openSearchPalette } from '../search/search-actions';
import { SearchInput } from './SearchInput';
import { SearchKey } from './SearchKey';

function SearchTrigger() {
  return (
    <button
      type="button"
      className="srch-row"
      title={`Hľadať v pošte (${MOD}F)`}
      onClick={openSearchPalette}
    >
      <Icon name="search" size={14} />
      <span className="srch-lb">Hľadať</span>
      <SearchKey label="/" />
    </button>
  );
}

export function SearchField({ open }: { readonly open: boolean }) {
  return (
    <div className={open ? 'srch open' : 'srch'}>{open ? <SearchInput /> : <SearchTrigger />}</div>
  );
}
