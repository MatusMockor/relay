import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { CalendarPartsSink } from './calendar-parts-sink';
import type { CreatedMessage, IngestTarget } from './ingest-target';
import { acceptsJiraEvents } from './jira-event-roles';

const journalArrival = async (
  work: PendingWorkRepository,
  target: IngestTarget,
  created: CreatedMessage,
): Promise<void> => {
  const { journal } = target;
  if (journal === null) {
    return;
  }
  const { message, parsed, jira } = created;
  await journal.arrived(work, message, target.mailbox.role, created.splitIds, {
    publish: target.publish,
    live: target.live,
    headers: parsed.headers,
    jira,
  });
  if (jira !== null && acceptsJiraEvents(target.mailbox.role)) {
    await journal.jira(work, message.id, {
      threadId: message.threadId,
      classification: jira,
      title: parsed.subject,
      from: parsed.from,
      headers: [...parsed.headers.entries()],
    });
  }
};

export const recordCreated = async (
  work: PendingWorkRepository,
  calendarParts: CalendarPartsSink,
  target: IngestTarget,
  created: CreatedMessage,
): Promise<void> => {
  if (target.history === true) {
    await target.journal?.filed(work, created.message, target.mailbox.role, created.splitIds);
    return;
  }
  await journalArrival(work, target, created);
  await calendarParts.queue(work, {
    account: target.account,
    mailboxRole: target.mailbox.role,
    messageId: created.message.id,
    threadId: created.message.threadId,
    parts: created.parsed.calendarParts ?? [],
    publish: target.publish,
    hold: target.holdCalendar,
  });
};
