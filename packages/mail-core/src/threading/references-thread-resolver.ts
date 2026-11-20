import {
  DEFAULT_SUBJECT_WINDOW_DAYS,
  type IdGenerator,
  type ParsedMessage,
  subjectFallbackWindow,
  type ThreadResolution,
  type ThreadResolver,
} from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import type { ThreadLookup } from './thread-lookup';

export interface ReferencesThreadResolverOptions {
  readonly subjectWindowDays?: number;
}

export const relatedMessageIds = (message: ParsedMessage): string[] => {
  const ids = [
    ...(message.inReplyTo ? [message.inReplyTo] : []),
    ...[...message.references].reverse(),
    ...(message.messageIdHeader ? [message.messageIdHeader] : []),
  ];
  return [...new Set(ids)];
};

export class ReferencesThreadResolver implements ThreadResolver {
  constructor(
    private readonly lookup: ThreadLookup,
    private readonly ids: IdGenerator,
    private readonly options: ReferencesThreadResolverOptions = {},
  ) {}

  async resolve(accountId: AccountId, message: ParsedMessage): Promise<ThreadResolution> {
    const related = relatedMessageIds(message);
    const byReference = await this.lookup.findByMessageIds(accountId, related);
    if (byReference) {
      return { threadId: byReference, isNew: false };
    }
    const byReply = await this.lookup.findByReplyTo(accountId, related);
    if (byReply) {
      return { threadId: byReply, isNew: false };
    }
    const bySubject = await this.findBySubject(accountId, message);
    if (bySubject) {
      return { threadId: bySubject, isNew: false };
    }
    return { threadId: this.ids.generate('thread'), isNew: true };
  }

  private async findBySubject(accountId: AccountId, message: ParsedMessage) {
    const window = subjectFallbackWindow(
      {
        subject: message.subject,
        date: message.date,
        hasReplyHeaders: message.inReplyTo !== null || message.references.length > 0,
      },
      this.options.subjectWindowDays ?? DEFAULT_SUBJECT_WINDOW_DAYS,
    );
    if (window === null) {
      return null;
    }
    return this.lookup.findBySubject(accountId, window);
  }
}
