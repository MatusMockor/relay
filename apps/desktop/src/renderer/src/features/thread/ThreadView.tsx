import { displaySubject, type Message, type ThreadDetail } from '@relay/shared';
import { AccountSquare } from '@relay/ui';
import { Fragment } from 'react';
import { useThreadDetail } from '../../data/hooks/use-mail-queries';
import { useThreadAiPending } from '../../data/hooks/use-thread-ai';
import { describeWhen } from '../../lib/dates';
import { plural } from '../../lib/text';
import { setUi, useUiStore } from '../../state/ui-store';
import { useMailActions } from '../mail/MailActionsProvider';
import { accountLike, useAccountsModel } from '../mail/use-accounts-model';
import { AiSummary } from './AiSummary';
import { InvitationCards } from './InvitationCards';
import { CollapsedMessage, MessageView } from './MessageView';
import { NextActions } from './NextActions';
import { ReplyComposer } from './ReplyComposer';
import { ThreadLabels } from './ThreadLabels';

const toggle = (key: string) => {
  setUi((state) => ({ expanded: { ...state.expanded, [key]: state.expanded[key] !== true } }));
};

function ThreadMeta({
  detail,
  own,
}: {
  readonly detail: ThreadDetail;
  readonly own: ReadonlySet<string>;
}) {
  const model = useAccountsModel();
  const { thread, messages } = detail;
  const names = [
    ...new Set(
      messages.map((message) =>
        own.has(message.from?.email ?? '')
          ? 'ty'
          : (message.from?.name ?? message.from?.email ?? ''),
      ),
    ),
  ];
  const account = model.byId.get(thread.accountId);
  const count = messages.length;
  const parts = [names.join(', '), `${String(count)} ${plural(count, 'mail', 'maily', 'mailov')}`];
  return (
    <div className="t-meta">
      {parts.map((part, index) => (
        <Fragment key={part}>
          {index > 0 ? <span>·</span> : null}
          <span>{part}</span>
        </Fragment>
      ))}
      {thread.jiraKey === null ? null : (
        <>
          <span>·</span>
          <span className="key">{thread.jiraKey}</span>
        </>
      )}
      {thread.remindAt === null || thread.state !== 'reminder' ? null : (
        <>
          <span>·</span>
          <span>{`pripomenie sa ${describeWhen(new Date(thread.remindAt), new Date()).phrase}`}</span>
        </>
      )}
      {model.multi && account !== undefined ? (
        <>
          <span>·</span>
          <span className="acc-in" title={`Účet ${account.displayName}`}>
            <AccountSquare account={accountLike(account)} small />
            {`Prijaté na ${account.email}`}
          </span>
        </>
      ) : null}
    </div>
  );
}

const isMine = (message: Message, own: ReadonlySet<string>) => own.has(message.from?.email ?? '');

export function ThreadView() {
  const threadId = useUiStore((state) => state.openThreadId);
  const reply = useUiStore((state) => state.reply);
  const expanded = useUiStore((state) => state.expanded);
  const model = useAccountsModel();
  const actions = useMailActions();
  const { data: detail } = useThreadDetail(threadId);
  const pending = useThreadAiPending(detail?.thread ?? null);
  if (detail === null || detail === undefined) {
    return <div className="t-scroll" aria-busy="true" />;
  }
  const own = new Set(model.accounts.map((account) => account.email));
  const forward = (message: Message) => () => {
    actions.compose.forward(detail.thread.id, message.id);
  };
  const last = detail.messages.at(-1);
  const earlier = detail.messages.slice(0, -1);
  const recipient =
    detail.thread.participants[0]?.name ?? detail.thread.participants[0]?.email ?? '';
  return (
    <div className="t-scroll" id="thread">
      <div className="t-col">
        <h1 className="t-h1">
          {detail.thread.subject === ''
            ? '(bez predmetu)'
            : displaySubject(detail.thread.subject, detail.thread.jiraKey)}
        </h1>
        <ThreadMeta detail={detail} own={own} />
        <ThreadLabels thread={detail.thread} />
        <AiSummary detail={detail} pending={pending.includes('summary')} />
        <InvitationCards threadId={detail.thread.id} />
        <div className="t-stack">
          {earlier.map((message) => {
            const key = `${detail.thread.id}:${message.id}`;
            return expanded[key] === true ? (
              <MessageView
                key={message.id}
                message={message}
                mine={isMine(message, own)}
                recipientName={recipient}
                onCollapse={() => {
                  toggle(key);
                }}
                onForward={forward(message)}
              />
            ) : (
              <CollapsedMessage
                key={message.id}
                message={message}
                mine={isMine(message, own)}
                onExpand={() => {
                  toggle(key);
                }}
              />
            );
          })}
          {last === undefined ? null : (
            <MessageView
              key={last.id}
              message={last}
              mine={isMine(last, own)}
              recipientName={recipient}
              onForward={forward(last)}
            />
          )}
        </div>
        {reply?.threadId === detail.thread.id ? (
          <ReplyComposer detail={detail} reply={reply} />
        ) : (
          <NextActions detail={detail} pending={pending.includes('replySuggestions')} />
        )}
      </div>
    </div>
  );
}
