import type { IdGenerator, ParsedMessage, ThreadResolution, ThreadResolver } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import { normalizeSubject } from './normalize-subject';
import type { ThreadLookup } from './thread-lookup';

export interface ReferencesThreadResolverOptions {
  readonly subjectWindowDays?: number;
}

const DEFAULT_SUBJECT_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

export const relatedMessageIds = (message: ParsedMessage): string[] => {
  const ids = [
    ...(message.inReplyTo ? [message.inReplyTo] : []),
    ...[...message.references].reverse(),
    ...(message.messageIdHeader ? [message.messageIdHeader] : []),
  ];
  return [...new Set(ids)];
};

const looksLikeReply = (message: ParsedMessage, hadReplyPrefix: boolean): boolean =>
  hadReplyPrefix || message.inReplyTo !== null || message.references.length > 0;

export class ReferencesThreadResolver implements ThreadResolver {
  constructor(
    private readonly lookup: ThreadLookup,
    private readonly ids: IdGenerator,
    private readonly options: ReferencesThreadResolverOptions = {},
  ) {}

  async resolve(accountId: AccountId, message: ParsedMessage): Promise<ThreadResolution> {
    const byReference = await this.lookup.findByMessageIds(accountId, relatedMessageIds(message));
    if (byReference) {
      return { threadId: byReference, isNew: false };
    }
    const bySubject = await this.findBySubject(accountId, message);
    if (bySubject) {
      return { threadId: bySubject, isNew: false };
    }
    return { threadId: this.ids.generate('thread'), isNew: true };
  }

  private async findBySubject(accountId: AccountId, message: ParsedMessage) {
    const subject = normalizeSubject(message.subject);
    if (subject.value === '' || !looksLikeReply(message, subject.hadReplyPrefix)) {
      return null;
    }
    const windowMs = (this.options.subjectWindowDays ?? DEFAULT_SUBJECT_WINDOW_DAYS) * DAY_MS;
    const until = new Date(message.date);
    return this.lookup.findBySubject(accountId, {
      normalizedSubject: subject.value,
      since: new Date(until.getTime() - windowMs),
      until,
    });
  }
}
