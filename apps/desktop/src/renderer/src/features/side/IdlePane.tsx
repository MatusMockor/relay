import { useTasks, useThreadList } from '../../data/hooks/use-mail-queries';
import { describeWhen, WEEKDAYS, dm } from '../../lib/dates';
import { capitalize } from '../../lib/text';
import { useMailActions } from '../mail/MailActionsProvider';
import { openThread, selectScope } from '../mail/navigation';
import { useAccountsModel } from '../mail/use-accounts-model';
import { AccountDot, Icon } from '@relay/ui';
import { accountLike } from '../mail/use-accounts-model';
import { MiniSection } from './Mini';

export function IdlePane() {
  const now = new Date();
  const model = useAccountsModel();
  const { items } = useMailActions();
  const reminders = useThreadList({ view: 'reminders' });
  const inbox = useThreadList({ view: 'inbox' });
  const tasks = useTasks();
  const open = (tasks.data?.items ?? []).filter((task) => task.state !== 'done');
  const lead =
    items.length > 0 || open.length > 0
      ? 'Toto ťa ešte čaká neskôr.'
      : 'Dnes už nič nečaká. Pekný zvyšok dňa.';
  const unreadOf = (id: string) =>
    (inbox.data?.items ?? []).filter((thread) => thread.accountId === id && thread.unread).length;
  return (
    <>
      <div className="day-h">
        <span className="day-ic" aria-hidden="true">
          <Icon name="calendar" size={16} />
        </span>
        <div>
          <small>{model.unified ? 'Prehľad dňa · všetky účty' : 'Prehľad dňa'}</small>
          <h3>{`${capitalize(WEEKDAYS[now.getDay()] ?? '')} ${dm(now)}`}</h3>
        </div>
      </div>
      <p className="day-lead">{lead}</p>
      {model.unified ? (
        <MiniSection
          title="Neprečítané podľa účtu"
          rows={model.accounts.map((account) => ({
            key: account.id,
            left: (
              <span className="dot-l">
                <AccountDot account={accountLike(account)} />
                {account.displayName}
              </span>
            ),
            right: String(unreadOf(account.id)),
            onClick: () => {
              selectScope(account.id);
            },
          }))}
        />
      ) : null}
      <MiniSection
        title="Pripomenuté"
        rows={(reminders.data?.items ?? []).map((thread) => ({
          key: thread.id,
          left: thread.subject,
          right: thread.remindAt === null ? '' : describeWhen(new Date(thread.remindAt), now).short,
          onClick: () => {
            openThread(thread.id);
          },
        }))}
      />
      <MiniSection
        title="Otvorené úlohy"
        rows={open.slice(0, 5).map((task) => ({
          key: task.id,
          left: (
            <>
              <span className="key">{task.jiraKey ?? ''}</span> {task.title}
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
    </>
  );
}
