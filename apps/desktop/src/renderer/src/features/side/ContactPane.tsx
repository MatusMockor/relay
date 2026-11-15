import { displaySubject, type ThreadSummary } from '@relay/shared';
import { AccountDot, Avatar, Button, Icon, Spark } from '@relay/ui';
import { useTasks, useThreadDetail, useThreadList } from '../../data/hooks/use-mail-queries';
import { listTimeLabel } from '../../lib/dates';
import { plural } from '../../lib/text';
import { setUi, useUiStore } from '../../state/ui-store';
import { jiraActorOf } from '../mail/jira-display';
import { useMailActions } from '../mail/MailActionsProvider';
import { openRight, openThread } from '../mail/navigation';
import { accountLike, useAccountsModel } from '../mail/use-accounts-model';
import { isAutomated } from '../thread/automated';
import { useChat } from './chat-store';
import { IdlePane } from './IdlePane';
import { MiniSection } from './Mini';

function ContactDetails({ thread }: { readonly thread: ThreadSummary }) {
  const model = useAccountsModel();
  const person = thread.participants[0];
  const all = useThreadList({ view: 'inbox' });
  const done = useThreadList({ view: 'done' });
  const tasks = useTasks();
  const ask = useChat((state) => state.ask);
  if (person === undefined) {
    return null;
  }
  const bot = isAutomated(person);
  const actor = jiraActorOf(thread);
  const name = actor ?? person.name ?? person.email;
  const sameContact = (item: ThreadSummary): boolean =>
    actor === null ? item.participants[0]?.email === person.email : jiraActorOf(item) === actor;
  const related = [...(all.data?.items ?? []), ...(done.data?.items ?? [])].filter(
    (item) => item.id !== thread.id && sameContact(item),
  );
  const jira = (tasks.data?.items ?? []).filter(
    (task) =>
      task.threadId === thread.id ||
      (task.jiraKey !== null && related.some((item) => item.jiraKey === task.jiraKey)),
  );
  const account = model.byId.get(thread.accountId);
  return (
    <>
      <div className="a-prof">
        <Avatar name={name} seed={actor ?? person.email} size="lg" />
        <h3>{name}</h3>
        <p>{actor === null ? person.email : `Jira · ${person.email}`}</p>
        {bot ? null : (
          <div className="pacts">
            <Button
              onClick={() => {
                setUi({
                  overlay: {
                    kind: 'compose',
                    init: { toEmail: person.email, toName: person.name },
                  },
                });
              }}
            >
              <Icon name="pen" />
              Napísať
            </Button>
            <Button
              onClick={() => {
                openRight('ai');
                ask(`Čo odo mňa chce ${name}?`);
              }}
            >
              <Spark />
              Opýtať sa AI
            </Button>
          </div>
        )}
      </div>
      {thread.aiOneLiner === null ? null : (
        <div className="ai-card">
          <span className="h">
            <Spark />
            Zhrnutie
          </span>
          {thread.aiOneLiner}
        </div>
      )}
      <MiniSection
        title="Súvisí v Jire"
        rows={jira.map((task) => ({
          key: task.id,
          left: (
            <>
              <span className="key">{task.jiraKey}</span> {task.title}
            </>
          ),
          right: task.aiWhat ?? '',
          onClick:
            task.threadId === null
              ? undefined
              : () => {
                  openThread(task.threadId as NonNullable<typeof task.threadId>);
                },
        }))}
      />
      <MiniSection
        title={bot ? 'Posledné notifikácie' : 'Posledné konverzácie'}
        rows={related.slice(0, 4).map((item) => ({
          key: item.id,
          left: displaySubject(item.subject, item.jiraKey),
          right: listTimeLabel(item.lastMessageAt, new Date()),
          onClick: () => {
            openThread(item.id);
          },
        }))}
      />
      <div className="sec">
        <h4>{bot ? 'Odosielateľ' : 'Kontakt'}</h4>
        <dl className="kv">
          <dt>E-mail</dt>
          <dd>{person.email}</dd>
          <dt>Spolu</dt>
          <dd>{`${String(related.length + 1)} ${plural(related.length + 1, 'konverzácia', 'konverzácie', 'konverzácií')}`}</dd>
          {model.multi && account !== undefined ? (
            <>
              <dt>Účet</dt>
              <dd>
                <AccountDot account={accountLike(account)} /> {account.displayName}
              </dd>
            </>
          ) : null}
        </dl>
      </div>
    </>
  );
}

export function ContactPane() {
  const { current } = useMailActions();
  const openThreadId = useUiStore((state) => state.openThreadId);
  const detail = useThreadDetail(openThreadId);
  const thread = current?.kind === 'thread' ? current.thread : (detail.data?.thread ?? null);
  return (
    <div className="sbody">
      {thread === null ? <IdlePane /> : <ContactDetails thread={thread} />}
    </div>
  );
}
