import type { ThreadSummary } from '@relay/shared/domain';
import { byDateAscending } from '../../shared/dates';
import type { ThreadActionContext } from '../thread-action-context';
import type { FlagWriter } from './flag-writer';

export class ReadStateHandler {
  constructor(private readonly flags: FlagWriter) {}

  markRead(context: ThreadActionContext): Promise<ThreadSummary> {
    const targets = context.messages.filter((message) => !message.flags.seen);
    return this.flags.write(context, targets, 'seen', true);
  }

  markUnread(context: ThreadActionContext): Promise<ThreadSummary> {
    const latest = [...context.messages].sort(byDateAscending).at(-1);
    const targets = latest === undefined || !latest.flags.seen ? [] : [latest];
    return this.flags.write(context, targets, 'seen', false);
  }
}
