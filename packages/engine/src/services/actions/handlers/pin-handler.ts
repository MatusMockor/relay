import type { ThreadSummary } from '@relay/shared/domain';
import { byDateAscending } from '../../shared/dates';
import type { ThreadActionContext } from '../thread-action-context';
import type { FlagWriter } from './flag-writer';

export class PinHandler {
  constructor(private readonly flags: FlagWriter) {}

  pin(context: ThreadActionContext): Promise<ThreadSummary> {
    const latest = [...context.messages].sort(byDateAscending).at(-1);
    const targets = latest === undefined || latest.flags.flagged ? [] : [latest];
    return this.flags.write(context, targets, 'flagged', true);
  }

  unpinAll(context: ThreadActionContext): Promise<ThreadSummary> {
    const targets = context.messages.filter((message) => message.flags.flagged);
    return this.flags.write(context, targets, 'flagged', false);
  }
}
