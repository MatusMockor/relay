import type { AutomationId, MessageId, UserId } from '@relay/shared/domain';

export interface AutomationRun {
  readonly userId: UserId;
  readonly automationId: AutomationId;
  readonly messageId: MessageId;
  readonly createdAt: string;
}

export interface AutomationRunRepository {
  claim(run: AutomationRun): Promise<boolean>;
  release(automationId: AutomationId, messageIds: readonly MessageId[]): Promise<void>;
}
