import { Highlight } from '../list/Highlight';
import { searchDateLabel } from './search-date';
import type { SearchResult } from './search-session';

export interface SearchResultRowProps {
  readonly result: SearchResult;
  readonly query: string;
  readonly active: boolean;
  readonly now: Date;
  readonly onHover: () => void;
  readonly onPick: () => void;
}

export function SearchResultRow({
  result,
  query,
  active,
  now,
  onHover,
  onPick,
}: SearchResultRowProps) {
  const { thread } = result;
  const who = thread.participants[0]?.name ?? thread.participants[0]?.email ?? '';
  const subject = thread.subject === '' ? '(bez predmetu)' : thread.subject;
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-key={result.key}
      className={active ? 'spal-row on' : 'spal-row'}
      onMouseMove={onHover}
      onClick={onPick}
    >
      <span className="w">
        <Highlight text={who} query={query} />
      </span>
      <span className="l">
        <span className="s">
          <Highlight text={subject} query={query} />
        </span>
        <span className="n">
          <Highlight text={thread.snippet} query={query} />
        </span>
      </span>
      <span className="d">
        {result.source === 'server' ? <span className="spal-srv">server</span> : null}
        {searchDateLabel(thread.lastMessageAt, now)}
      </span>
    </button>
  );
}
