import { type Address, displaySubject } from '@relay/shared';
import { Avatar, Button, Spark } from '@relay/ui';
import { listTimeLabel } from '../../lib/dates';
import { openThread } from '../mail/navigation';
import { ChatAnswer } from './ChatAnswer';
import { RECENT_LIMIT } from './contact-model';
import { MiniSection } from './Mini';
import { useContactContext } from './use-contact-context';
import { useContactThreads } from './use-contact-threads';

export function ComposeContact({ recipient }: { readonly recipient: Address }) {
  const { threads } = useContactThreads({ email: recipient.email, actor: null });
  const context = useContactContext(recipient);
  const name = recipient.name ?? recipient.email;
  const { turn } = context;
  return (
    <>
      <div className="a-prof">
        <div className="c-rcpt" title={recipient.email}>
          <Avatar name={name} seed={recipient.email.toLowerCase()} size="sm" />
          <b>{name}</b>
          <span>· adresát</span>
        </div>
        <div className="pacts">
          <Button disabled={context.running} onClick={context.run}>
            <Spark />
            Pripomenúť kontext
          </Button>
        </div>
      </div>
      <MiniSection
        title="Posledné konverzácie"
        rows={threads.slice(0, RECENT_LIMIT).map((item) => ({
          key: item.id,
          left: displaySubject(item.subject, item.jiraKey),
          right: listTimeLabel(item.lastMessageAt, new Date()),
          onClick: () => {
            openThread(item.id);
          },
        }))}
      />
      {turn === null ? null : (
        <section className="ai-card" aria-label="Kontext">
          <span className="h">
            <Spark />
            Kontext
          </span>
          {turn.answer === '' ? (
            <span className="note">{turn.steps.at(-1) ?? 'Zisťujem…'}</span>
          ) : (
            <ChatAnswer
              text={turn.answer}
              references={turn.references}
              failed={turn.status === 'error'}
            />
          )}
        </section>
      )}
    </>
  );
}
