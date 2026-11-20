import { Highlight } from '../list/Highlight';
import { PaletteOption } from './PaletteOption';
import { searchDateLabel } from './search-date';
import type { SearchResult } from './search-session';

export interface SearchResultRowProps {
  readonly id: string;
  readonly result: SearchResult;
  readonly query: string;
  readonly active: boolean;
  readonly now: Date;
  readonly onHover: () => void;
  readonly onPick: () => void;
}

export function SearchResultRow({
  id,
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
    <PaletteOption id={id} active={active} className="spal-row" onHover={onHover} onPick={onPick}>
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
    </PaletteOption>
  );
}
