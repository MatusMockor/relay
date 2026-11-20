import { Icon } from '@relay/ui';
import type { ReactNode } from 'react';
import { resultCount } from '../../lib/text';
import type { SearchResult } from './search-session';
import type { ServerSearchState } from './use-server-search';

export const OFFLINE_NOTE =
  'Si offline. Staršie maily nájdem len podľa odosielateľa a predmetu, text prehľadám po pripojení.';
export const PARTIAL_NOTE = 'Server neodpovedal včas, staršia pošta nemusí byť úplná.';
const SERVER_TITLE = 'Staršia pošta na serveri';

export interface ServerSectionProps {
  readonly state: ServerSearchState;
  readonly results: readonly SearchResult[];
  readonly renderRow: (result: SearchResult) => ReactNode;
}

function SkeletonRow({ width }: { readonly width: string }) {
  return (
    <div className="spal-row spal-skel" aria-hidden="true">
      <span className="sk" style={{ width: 80 }} />
      <span className="sk" style={{ width }} />
      <span className="sk" style={{ width: 34 }} />
    </div>
  );
}

export function ServerSection({ state, results, renderRow }: ServerSectionProps) {
  if (state.status === 'idle' || state.status === 'unsupported' || state.status === 'skipped') {
    return null;
  }
  if (state.status === 'offline') {
    return (
      <div className="spal-note" role="status">
        {OFFLINE_NOTE}
      </div>
    );
  }
  if (state.status === 'pending') {
    return (
      <div role="group" aria-label={SERVER_TITLE} aria-busy="true">
        <div className="spal-sec">
          <span className="spal-spin" aria-hidden="true" />
          {SERVER_TITLE}
          <span className="r">hľadám…</span>
        </div>
        <SkeletonRow width="72%" />
        <SkeletonRow width="61%" />
      </div>
    );
  }
  return (
    <div role="group" aria-label={SERVER_TITLE}>
      <div className="spal-sec">
        <Icon name="mail" size={14} />
        {SERVER_TITLE}
        <span className="r">{resultCount(results.length)}</span>
      </div>
      {results.map(renderRow)}
      {state.status === 'partial' ? <div className="spal-note quiet">{PARTIAL_NOTE}</div> : null}
    </div>
  );
}
