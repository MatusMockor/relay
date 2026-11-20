import { Icon } from '@relay/ui';
import type { ReactNode } from 'react';
import { localCount } from './local-count';
import type { SearchResult } from './search-session';
import type { SearchResults } from './use-search-results';

export const LOCAL_ERROR_NOTE = 'Lokálne hľadanie zlyhalo. Skús to znova.';

export interface LocalSectionProps {
  readonly query: string;
  readonly results: SearchResults;
  readonly renderRow: (result: SearchResult) => ReactNode;
}

function LocalNote({ query, results }: Omit<LocalSectionProps, 'renderRow'>) {
  if (results.localStatus === 'error') {
    return (
      <div className="pal-empty" role="alert">
        {LOCAL_ERROR_NOTE}
      </div>
    );
  }
  if (results.localStatus === 'ready' && results.local.length === 0) {
    return <div className="pal-empty">{`Lokálne nič pre „${query.trim()}“.`}</div>;
  }
  return null;
}

export function LocalSection({ query, results, renderRow }: LocalSectionProps) {
  const { local, localStatus } = results;
  const pending = localStatus === 'pending';
  return (
    <div role="group" aria-label="Maily" aria-busy={pending}>
      <div className="spal-sec">
        <Icon name="mail" size={14} />
        Maily
        {pending ? <span className="r">hľadám…</span> : null}
        {localStatus === 'ready' ? <span className="r">{localCount(local.length)}</span> : null}
      </div>
      {local.map(renderRow)}
      <LocalNote query={query} results={results} />
    </div>
  );
}
