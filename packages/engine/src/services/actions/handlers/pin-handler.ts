import type { ThreadSummary } from '@relay/shared/domain';
import type { ThreadActionContext } from '../thread-action-context';
import { pinTargets } from './action-targets';
import type { FlagWriter } from './flag-writer';

export class PinHandler {
  constructor(private readonly flags: FlagWriter) {}

  pin(context: ThreadActionContext): Promise<ThreadSummary> {
    return this.flags.write(context, pinTargets(context.messages), 'flagged', true);
  }

  unpinAll(context: ThreadActionContext): Promise<ThreadSummary> {
    const targets = context.messages.filter((message) => message.flags.flagged);
    return this.flags.write(context, targets, 'flagged', false);
  }
}
