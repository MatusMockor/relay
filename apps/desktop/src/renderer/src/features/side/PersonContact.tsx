import { composeOverlay } from '../../state/compose-overlay';
import { type Address, displaySubject, type Task, type ThreadSummary } from '@relay/shared';
import { Button, Icon, Spark } from '@relay/ui';
import { useTasks, useUserSettings } from '../../data/hooks/use-mail-queries';
import { listTimeLabel } from '../../lib/dates';
import { plural } from '../../lib/text';
import { setUi, useUiStore } from '../../state/ui-store';
import { jiraActorOf } from '../mail/jira-display';
import { openRight, openThread } from '../mail/navigation';
import { useChat } from './chat-store';
import { jiraTasksFor, matchesContact, openTasksFor, RECENT_LIMIT } from './contact-model';
import { ContactHeader } from './ContactHeader';
import { MiniSection } from './Mini';
import { useContactThreads } from './use-contact-threads';

export interface PersonContactProps {
  readonly thread: ThreadSummary;
  readonly person: Address;
  readonly actions: boolean;
}

const taskOpener = (task: Task): (() => void) | undefined => {
  const { threadId } = task;
  if (threadId === null) {
    return undefined;
  }
  return () => {
    openThread(threadId);
  };
};

function ContactActions({ person, name }: { readonly person: Address; readonly name: string }) {
  const ask = useChat((state) => state.ask);
  return (
    <div className="pacts">
      <Button
        onClick={() => {
          setUi({
            overlay: composeOverlay({ toEmail: person.email, toName: person.name }),
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
  );
}

const conversations = (count: number): string =>
  `${String(count)} ${plural(count, 'konverzácia', 'konverzácie', 'konverzácií')}`;

export function PersonContact({ thread, person, actions }: PersonContactProps) {
  const actor = jiraActorOf(thread);
  const { threads } = useContactThreads((item, own) =>
    matchesContact(item, { email: person.email, actor }, own),
  );
  const tasks = useTasks().data?.items ?? [];
  const openTasks = useTasks({ state: 'open' }).data?.items ?? [];
  const name = actor ?? person.name ?? person.email;
  const related = threads.filter((item) => item.id !== thread.id);
  const jira = jiraTasksFor(tasks, thread.id, related);
  const open = openTasksFor(
    openTasks,
    new Set([thread.id, ...related.map((item) => item.id)]),
    jira,
  );
  const inThread = useUiStore((state) => state.openThreadId === thread.id);
  const inList = useUserSettings().data?.ai.features.oneLiners ?? true;
  const summaryShown = inThread || inList;
  return (
    <>
      <ContactHeader
        name={name}
        seed={actor ?? person.email}
        subtitle={person.email}
        meta={[actor === null ? null : 'cez Jira', conversations(related.length + 1)]
          .filter((part) => part !== null)
          .join(' · ')}
        accountId={thread.accountId}
      >
        {actions ? <ContactActions person={person} name={name} /> : null}
      </ContactHeader>
      {thread.aiOneLiner === null || summaryShown ? null : (
        <div className="ai-card">
          <span className="h">
            <Spark />
            Zhrnutie
          </span>
          {thread.aiOneLiner}
        </div>
      )}
      <MiniSection
        stacked
        title="Súvisí v Jire"
        rows={jira.map((task) => ({
          key: task.id,
          left: (
            <>
              <span className="key">{task.jiraKey}</span> {task.title}
            </>
          ),
          right: task.aiWhat ?? '',
          onClick: taskOpener(task),
        }))}
      />
      <MiniSection
        title="Posledné konverzácie"
        rows={related.slice(0, RECENT_LIMIT).map((item) => ({
          key: item.id,
          left: displaySubject(item.subject, item.jiraKey),
          right: listTimeLabel(item.lastMessageAt, new Date()),
          onClick: () => {
            openThread(item.id);
          },
        }))}
      />
      <MiniSection
        title="Otvorené úlohy"
        rows={open.map((task) => ({
          key: task.id,
          left: task.title,
          right: listTimeLabel(task.createdAt, new Date()),
          onClick: taskOpener(task),
        }))}
      />
    </>
  );
}
