import { displaySubject, type FolderView, type MailAccount, type Task } from '@relay/shared';
import { AccountSquare, cx } from '@relay/ui';
import { jiraActorOf } from '../mail/jira-display';
import type { ListItem } from '../mail/list-items';
import { accountLike } from '../mail/use-accounts-model';
import { RowActions } from '../shell/RowActions';
import { Highlight } from './Highlight';
import { LabelChips } from './LabelChips';
import { useThreadMenu } from './use-thread-menu';

export interface RowContext {
  readonly view: FolderView;
  readonly query: string;
  readonly unified: boolean;
  readonly oneLiners: boolean;
  readonly time: string;
  readonly account: MailAccount | undefined;
  readonly task: Task | undefined;
}

const TASK_TONE: Readonly<Record<string, string>> = { waiting: 'warn', open: 'acc', done: 'ok' };

const whoOf = (item: ListItem): string => {
  if (item.kind === 'thread') {
    const actor = jiraActorOf(item.thread);
    if (actor !== null) {
      return actor;
    }
    const first = item.thread.participants[0];
    return first?.name ?? first?.email ?? 'Neznámy';
  }
  const draft = item.kind === 'draft' ? item.draft : item.draft;
  const to = draft?.to[0];
  return to?.name ?? to?.email ?? 'Bez príjemcu';
};

function Snippet({ item, context }: { readonly item: ListItem; readonly context: RowContext }) {
  if (item.kind !== 'thread') {
    const body = (item.kind === 'draft' ? item.draft.body : (item.draft?.body ?? '')).replace(
      /\s+/g,
      ' ',
    );
    return (
      <span className="snip">
        {item.kind === 'draft' ? <span className="chip">Koncept</span> : null}{' '}
        <Highlight text={body} query={context.query} />
      </span>
    );
  }
  const { thread } = item;
  const chip = thread.hasDraft ? <span className="chip">Koncept</span> : null;
  if (context.oneLiners && thread.aiOneLiner !== null) {
    return (
      <>
        {chip}
        <span className="snip ai" title="Zhrnutie od AI">
          <Highlight text={thread.aiOneLiner} query={context.query} />
        </span>
      </>
    );
  }
  return (
    <>
      {chip}
      <span className="snip">
        <Highlight text={thread.snippet} query={context.query} />
      </span>
    </>
  );
}

export interface RowPosition {
  readonly index: number;
  readonly setSize: number;
}

export interface ListRowProps {
  readonly item: ListItem;
  readonly selected: boolean;
  readonly context: RowContext;
  readonly onOpen: (item: ListItem) => void;
  readonly position?: RowPosition;
}

export function ListRow({ item, selected, context, onOpen, position }: ListRowProps) {
  const showThreadMenu = useThreadMenu();
  const thread = item.kind === 'thread' ? item.thread : null;
  const subject =
    item.kind === 'thread'
      ? displaySubject(item.thread.subject, item.thread.jiraKey)
      : item.kind === 'draft'
        ? item.draft.subject
        : (item.draft?.subject ?? '');
  const tag =
    thread === null
      ? ''
      : thread.messageCount > 1
        ? String(thread.messageCount)
        : thread.jiraKey !== null && jiraActorOf(thread) === null && context.view !== 'inbox'
          ? 'Jira'
          : '';
  return (
    <div
      className={cx('a-row', thread?.unread === true && 'unread', selected && 'sel')}
      data-row={item.key}
      title={context.unified ? context.account?.displayName : undefined}
      role="option"
      aria-selected={selected}
      aria-posinset={position === undefined ? undefined : position.index + 1}
      aria-setsize={position?.setSize}
      onClick={() => {
        onOpen(item);
      }}
      onContextMenu={
        item.kind === 'thread'
          ? (event) => {
              showThreadMenu(event, item, context.view);
            }
          : undefined
      }
    >
      <span className={thread?.unread === true ? 'dot' : undefined} />
      <span className="who">
        <span
          className="who-n"
          title={thread !== null && jiraActorOf(thread) !== null ? 'Cez Jira' : undefined}
        >
          <Highlight text={whoOf(item)} query={context.query} />
        </span>
        {tag === '' ? null : <small>{tag}</small>}
      </span>
      <span className="line">
        <span className="subj">
          {thread?.jiraKey == null ? null : <span className="key">{thread.jiraKey} </span>}
          <Highlight text={subject === '' ? '(bez predmetu)' : subject} query={context.query} />
        </span>
        {thread === null ? null : <LabelChips labelIds={thread.labelIds} />}
        <Snippet item={item} context={context} />
        {context.view === 'tasks' && context.task?.aiWhat != null ? (
          <span className={`st st-${TASK_TONE[context.task.state] ?? 'acc'}`}>
            {context.task.aiWhat}
          </span>
        ) : null}
      </span>
      <span className="when">
        {context.unified && context.account !== undefined ? (
          <span className="when-acc" title={context.account.displayName}>
            <AccountSquare account={accountLike(context.account)} small />
          </span>
        ) : null}
        <time>{context.time}</time>
      </span>
      <span className="acts">
        <RowActions item={item} inRow />
      </span>
    </div>
  );
}
