import type { Message } from '@relay/shared/domain';
import type { JiraClassification } from '../../model/jira';
import type { ParsedMessage } from '../../model/parsed-message';
import type { EffectGates, PlacedKind, PlaceOutcome } from '../../model/placement-ingest';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { CalendarPartsSink } from './calendar-parts-sink';
import type { CreatedMessage, IngestTarget } from './ingest-target';
import { arrivesIn } from './placement-effects';

export type PlacedOutcome = Exclude<PlaceOutcome, { readonly kind: 'unmatched' }> & {
  readonly kind: PlacedKind;
};

export const isPlacedOutcome = (outcome: PlaceOutcome): outcome is PlacedOutcome =>
  outcome.kind !== 'unmatched' && outcome.kind !== 'created';

export interface PlacedMessage {
  readonly outcome: PlacedOutcome;
  readonly parsed: ParsedMessage | null;
  readonly jira: JiraClassification | null;
}

interface ClaimedEffects {
  readonly message: Message;
  readonly parsed: ParsedMessage;
  readonly jira: JiraClassification | null;
  readonly claimed: EffectGates;
}

const queueClaimed = async (
  work: PendingWorkRepository,
  calendarParts: CalendarPartsSink,
  target: IngestTarget,
  effects: ClaimedEffects,
): Promise<void> => {
  const { journal } = target;
  const { message, parsed, jira, claimed } = effects;
  if (claimed.jira && jira !== null && journal !== null) {
    await journal.jira(work, message.id, {
      threadId: message.threadId,
      classification: jira,
      title: parsed.subject,
      from: parsed.from,
      headers: [...parsed.headers.entries()],
    });
  }
  if (!claimed.invite) {
    return;
  }
  await calendarParts.queue(work, {
    account: target.account,
    mailboxRole: target.mailbox.role,
    messageId: message.id,
    threadId: message.threadId,
    parts: parsed.calendarParts ?? [],
    publish: target.publish,
    hold: target.holdCalendar,
  });
};

export const recordCreated = async (
  work: PendingWorkRepository,
  calendarParts: CalendarPartsSink,
  target: IngestTarget,
  created: CreatedMessage & { readonly claimed: EffectGates },
): Promise<void> => {
  const { message, parsed, jira, splitIds } = created;
  const { role } = target.mailbox;
  if (target.history === true) {
    await target.journal?.filed(work, message, role, splitIds);
    return;
  }
  await target.journal?.arrived(work, message, role, splitIds, {
    publish: target.publish,
    live: target.live,
    headers: parsed.headers,
    jira,
    arrival: role === 'inbox',
  });
  await queueClaimed(work, calendarParts, target, created);
};

const journalPlaced = (
  work: PendingWorkRepository,
  target: IngestTarget,
  placed: PlacedMessage,
): Promise<void> => {
  const { journal } = target;
  const { outcome, parsed } = placed;
  if (journal === null) {
    return Promise.resolve();
  }
  const { role } = target.mailbox;
  if (parsed !== null && arrivesIn(target, outcome.kind, outcome.previous)) {
    return journal.arrived(work, outcome.message, role, [], {
      publish: target.publish,
      live: target.live,
      headers: parsed.headers,
      jira: placed.jira,
      arrival: true,
    });
  }
  if (outcome.kind === 'attached') {
    return journal.filed(work, outcome.message, role, []);
  }
  return journal.touched(work, outcome.message.threadId);
};

export const recordPlaced = async (
  work: PendingWorkRepository,
  calendarParts: CalendarPartsSink,
  target: IngestTarget,
  placed: PlacedMessage,
): Promise<void> => {
  await journalPlaced(work, target, placed);
  const { outcome, parsed, jira } = placed;
  if (parsed === null) {
    return;
  }
  await queueClaimed(work, calendarParts, target, {
    message: outcome.message,
    parsed,
    jira,
    claimed: outcome.claimed,
  });
};
