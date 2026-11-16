import type {
  CalendarMethod,
  MailAccount,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import type {
  CalendarSource,
  ParsedCalendarEvent,
  StoredCalendarEvent,
} from '../../model/calendar';
import type { Repositories } from '../../ports/repositories';
import type { IdGenerator } from '../../ports/id-generator';

export interface InviteContext {
  readonly userId: UserId;
  readonly account: MailAccount;
  readonly messageId: MessageId;
  readonly threadId: ThreadId;
  readonly method: CalendarMethod | null;
  readonly now: string;
}

export interface InviteHandler {
  apply(
    repositories: Repositories,
    context: InviteContext,
    event: ParsedCalendarEvent,
  ): Promise<boolean>;
}

export const inviteSource = (context: InviteContext): CalendarSource => ({
  kind: 'invite',
  accountId: context.account.id,
});

export const storedFrom = (
  ids: IdGenerator,
  context: InviteContext,
  { timed: _timed, ...event }: ParsedCalendarEvent,
  existing: StoredCalendarEvent | undefined,
  personal: Pick<StoredCalendarEvent, 'myPartstat' | 'myEmail'>,
): StoredCalendarEvent => ({
  ...event,
  id: existing?.id ?? ids.generate('calendarEvent'),
  userId: context.userId,
  source: inviteSource(context),
  method: context.method,
  myPartstat: personal.myPartstat,
  myEmail: personal.myEmail,
  messageId: context.messageId,
  threadId: context.threadId,
  createdAt: existing?.createdAt ?? context.now,
  updatedAt: context.now,
  revision: existing?.revision ?? 0,
});
