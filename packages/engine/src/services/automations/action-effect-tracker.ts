import type { AutomationAction, AutomationActivityAction, ThreadState } from '@relay/shared/domain';
import type { MessageRepository } from '../../ports/message-repository';
import type { ThreadRepository } from '../../ports/thread-repository';
import { changedMessages, tracksEffects } from './action-effects';
import type { AutomationActionContext } from './automation-action';

export type ActionEffect = Pick<AutomationActivityAction, 'changed' | 'previousState'>;

const NO_EFFECT: ActionEffect = { changed: [], previousState: null };

export class ActionEffectTracker {
  constructor(
    private readonly messages: MessageRepository,
    private readonly threads: ThreadRepository,
  ) {}

  async track(
    { userId, arrival }: AutomationActionContext,
    action: AutomationAction,
    run: () => Promise<void>,
  ): Promise<ActionEffect> {
    if (!tracksEffects(action)) {
      await run();
      return NO_EFFECT;
    }
    const { threadId } = arrival.message;
    const before = await this.messages.listByThread(userId, threadId);
    const previousState: ThreadState | null =
      (await this.threads.findById(userId, threadId))?.state ?? null;
    await run();
    const after = await this.messages.listByThread(userId, threadId);
    return { changed: changedMessages(action, before, after), previousState };
  }
}
