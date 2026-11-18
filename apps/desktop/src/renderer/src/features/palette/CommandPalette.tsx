import type { ThreadPage, ThreadSummary } from '@relay/shared';
import { Avatar, Icon, Kbd, Overlay } from '@relay/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { queryKeys } from '../../data/hooks/query-keys';
import { listTimeLabel } from '../../lib/dates';
import { foldText, fuzzyScore } from '../../lib/text';
import { setUi } from '../../state/ui-store';
import { isControlTarget } from '../keyboard/focus-target';
import { Highlight } from '../list/Highlight';
import { openThread } from '../mail/navigation';
import { type Command, useCommands } from './use-commands';

type PaletteItem =
  | { readonly kind: 'command'; readonly command: Command }
  | { readonly kind: 'thread'; readonly thread: ThreadSummary };

const useThreadMatches = (query: string): ThreadSummary[] => {
  const queryClient = useQueryClient();
  if (query.trim() === '') {
    return [];
  }
  const unique = new Map<string, ThreadSummary>();
  queryClient
    .getQueriesData<ThreadPage>({ queryKey: queryKeys.threadLists() })
    .forEach(([, page]) => {
      page?.items.forEach((thread) => unique.set(thread.id, thread));
    });
  return [...unique.values()]
    .map((thread) => ({
      thread,
      score: fuzzyScore(
        query,
        [thread.participants[0]?.name ?? '', thread.jiraKey ?? '', thread.subject].join(' '),
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item) => item.thread);
};

export function CommandPalette() {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const commands = useCommands()
    .map((command) => ({ command, score: fuzzyScore(query, `${command.label} ${command.alias}`) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, query.trim() === '' ? 20 : 6)
    .map((item) => item.command);
  const threads = useThreadMatches(query);
  const items: PaletteItem[] = [
    ...commands.map((command) => ({ kind: 'command' as const, command })),
    ...threads.map((thread) => ({ kind: 'thread' as const, thread })),
  ];
  const close = () => {
    setUi({ overlay: null });
  };
  const run = (item: PaletteItem | undefined) => {
    if (item === undefined) {
      return;
    }
    close();
    if (item.kind === 'command') {
      item.command.run();
      return;
    }
    openThread(item.thread.id);
  };
  const onKey = (event: KeyboardEvent) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      close();
      return true;
    }
    const down = event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n');
    const up = event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p');
    if (down || up) {
      event.preventDefault();
      setCursor((value) => Math.max(0, Math.min(items.length - 1, value + (down ? 1 : -1))));
      return true;
    }
    if (event.key === 'Enter' && !isControlTarget(event.target)) {
      event.preventDefault();
      run(items[cursor]);
      return true;
    }
    return false;
  };
  const row = (item: PaletteItem, index: number) => (
    <button
      key={item.kind === 'command' ? item.command.id : item.thread.id}
      type="button"
      className={`pi${index === cursor ? ' on' : ''}`}
      onMouseMove={() => {
        setCursor(index);
      }}
      onClick={() => {
        run(item);
      }}
    >
      {item.kind === 'command' ? (
        <>
          <span className="ic">{item.command.icon}</span>
          <span className="lb">
            <Highlight text={item.command.label} query={query} />
            {item.command.sub === undefined ? null : <small>{item.command.sub}</small>}
          </span>
          <span className="kk">
            <Kbd keys={item.command.keys} />
          </span>
        </>
      ) : (
        <>
          <span className="ic">
            <Avatar
              name={item.thread.participants[0]?.name ?? item.thread.participants[0]?.email ?? '?'}
              seed={item.thread.participants[0]?.email}
              size="sm"
            />
          </span>
          <span className="lb">
            {item.thread.jiraKey === null ? null : (
              <span className="key">{item.thread.jiraKey} </span>
            )}
            <Highlight text={item.thread.subject} query={query} />
            <small>
              <Highlight text={item.thread.participants[0]?.name ?? ''} query={query} />
            </small>
          </span>
          {foldText(`${item.thread.subject} ${item.thread.participants[0]?.name ?? ''}`).includes(
            foldText(query.trim()),
          ) ? null : (
            <small className="hit">v texte</small>
          )}
          <span className="wh">{listTimeLabel(item.thread.lastMessageAt, new Date())}</span>
        </>
      )}
    </button>
  );
  return (
    <Overlay onClose={close} onKey={onKey}>
      <div className="surface pal" role="dialog" aria-modal="true" aria-label="Príkazy">
        <div className="pal-in">
          <Icon name="search" />
          <input
            autoFocus
            id="pal-q"
            placeholder="Príkaz alebo konverzácia…"
            autoComplete="off"
            spellCheck={false}
            aria-label="Hľadať príkaz"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
          />
        </div>
        <div className="pal-body" role="listbox" aria-label="Výsledky">
          {commands.length === 0 ? null : <div className="grp">Akcie</div>}
          {commands.map((command, index) => row({ kind: 'command', command }, index))}
          {threads.length === 0 ? null : <div className="grp">Konverzácie</div>}
          {threads.map((thread, index) => row({ kind: 'thread', thread }, index + commands.length))}
          {items.length === 0 ? (
            <div className="pal-empty">{`Nič pre „${query}“. Skús „hotovo“, „jira“ alebo meno.`}</div>
          ) : null}
        </div>
        <div className="pal-foot">
          <span>
            <Kbd keys={['↑', '↓']} /> vybrať
          </span>
          <span>
            <Kbd keys={['↵']} /> spustiť
          </span>
          <span>
            <Kbd keys={['Esc']} /> zavrieť
          </span>
        </div>
      </div>
    </Overlay>
  );
}
