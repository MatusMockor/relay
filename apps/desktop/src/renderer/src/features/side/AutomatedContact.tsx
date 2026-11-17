import type { Address, ThreadSummary } from '@relay/shared';
import { Button, ConfirmDialog, Icon } from '@relay/ui';
import { messageTimeLabel } from '../../lib/dates';
import { plural } from '../../lib/text';
import { mailCount, matchesContact, newestFirst } from './contact-model';
import { ContactHeader } from './ContactHeader';
import { UnsubscribeButton } from './UnsubscribeButton';
import { threadCount, useArchiveSender } from './use-archive-sender';
import { useContactThreads } from './use-contact-threads';

export interface AutomatedContactProps {
  readonly thread: ThreadSummary;
  readonly sender: Address;
}

const subtitleOf = (threads: readonly ThreadSummary[]): string => {
  const count = mailCount(threads);
  const last = threads[0]?.lastMessageAt;
  const mails = `${String(count)} ${plural(count, 'mail', 'maily', 'mailov')}`;
  return last === undefined ? mails : `${mails} · posledný ${messageTimeLabel(last, new Date())}`;
};

export function AutomatedContact({ thread, sender }: AutomatedContactProps) {
  const key = { email: sender.email, actor: null };
  const { own, threads } = useContactThreads((item, mine) => matchesContact(item, key, mine));
  const all = threads.some((item) => item.id === thread.id)
    ? threads
    : [thread, ...threads].sort(newestFirst);
  const name = sender.name ?? sender.email;
  const archive = useArchiveSender((item) => matchesContact(item, key, own));
  return (
    <>
      <ContactHeader
        name={name}
        seed={sender.email}
        subtitle={subtitleOf(all)}
        accountId={thread.accountId}
        tag="automatický"
      >
        <div className="pacts">
          <Button
            disabled={archive.busy}
            onClick={() => {
              void archive.start();
            }}
          >
            <Icon name="check" />
            Archivovať všetky
          </Button>
          <UnsubscribeButton threadId={thread.id} sender={name} />
        </div>
      </ContactHeader>
      {archive.pending === null ? null : (
        <ConfirmDialog
          title={`Archivovať ${threadCount(archive.pending.length)} od ${name}?`}
          text="Vlákna sa presunú do priečinka Hotovo. Vrátiť ich môžeš hneď z oznámenia."
          confirmLabel="Archivovať"
          onConfirm={archive.confirm}
          onCancel={archive.cancel}
        />
      )}
    </>
  );
}
