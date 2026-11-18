import type { ThreadSummary } from '@relay/shared';
import { useThreadDetail } from '../../data/hooks/use-mail-queries';
import { useComposeRecipient } from '../../state/compose-recipient-store';
import { useUiStore } from '../../state/ui-store';
import { jiraActorOf } from '../mail/jira-display';
import { useMailActions } from '../mail/MailActionsProvider';
import { isAutomated } from '../thread/automated';
import { AutomatedContact } from './AutomatedContact';
import { ComposeContact } from './ComposeContact';
import { contactOf } from './contact-model';
import { IdlePane } from './IdlePane';
import { PersonContact } from './PersonContact';
import { useOwnAddresses } from './use-contact-threads';

function ThreadContact({ thread }: { readonly thread: ThreadSummary }) {
  const own = useOwnAddresses();
  const person = contactOf(thread, own);
  if (person === undefined) {
    return null;
  }
  const automated = isAutomated(person);
  if (automated && jiraActorOf(thread) === null) {
    return <AutomatedContact key={thread.id} thread={thread} sender={person} />;
  }
  return <PersonContact thread={thread} person={person} actions={!automated} />;
}

const useContactSubject = () => {
  const { current } = useMailActions();
  const openThreadId = useUiStore((state) => state.openThreadId);
  const composing = useUiStore((state) => state.overlay?.kind === 'compose');
  const recipient = useComposeRecipient((state) => state.recipient);
  const detail = useThreadDetail(openThreadId);
  const thread = current?.kind === 'thread' ? current.thread : (detail.data?.thread ?? null);
  return { recipient: composing ? recipient : null, thread };
};

function ContactBody() {
  const { recipient, thread } = useContactSubject();
  if (recipient !== null) {
    return <ComposeContact recipient={recipient} />;
  }
  return thread === null ? <IdlePane /> : <ThreadContact thread={thread} />;
}

export function ContactPane() {
  return (
    <div className="sbody">
      <ContactBody />
    </div>
  );
}
