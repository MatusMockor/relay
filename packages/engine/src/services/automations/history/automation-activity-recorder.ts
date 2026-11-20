import type { AutomationActivityAction, AutomationActivitySource } from '@relay/shared/domain';
import type {
  AutomationActivityRecord,
  AutomationActivityRepository,
} from '../../../ports/automation-activity-repository';
import type { Clock } from '../../../ports/clock';
import type { IdGenerator } from '../../../ports/id-generator';
import type { Logger } from '../../../ports/logger';
import { errorMessage } from '../../shared/mail-provider-sessions';
import type { AutomationActionContext } from '../automation-action';

export const ACTIVITY_RETENTION_DAYS = 90;
export const ACTIVITY_RETENTION_KEEP = 1000;
const DAY_MS = 24 * 60 * 60_000;

export interface AutomationActivityRecorderDeps {
  readonly activity: AutomationActivityRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
}

export class AutomationActivityRecorder {
  constructor(private readonly deps: AutomationActivityRecorderDeps) {}

  async record(
    context: AutomationActionContext,
    source: AutomationActivitySource,
    actions: readonly AutomationActivityAction[],
  ): Promise<void> {
    if (actions.length === 0) {
      return;
    }
    const now = this.deps.clock.now();
    const record = this.recordOf(context, source, actions, now.toISOString());
    await this.deps.activity
      .append(record, {
        olderThan: new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * DAY_MS).toISOString(),
        keep: ACTIVITY_RETENTION_KEEP,
      })
      .catch((error: unknown) => {
        this.deps.logger.warn('Recording automation activity failed', {
          automationId: context.automation.id,
          messageId: context.arrival.message.id,
          error: errorMessage(error),
        });
      });
  }

  private recordOf(
    { userId, automation, arrival }: AutomationActionContext,
    source: AutomationActivitySource,
    actions: readonly AutomationActivityAction[],
    createdAt: string,
  ): AutomationActivityRecord {
    const { message } = arrival;
    return {
      id: this.deps.ids.generate('automationActivity'),
      userId,
      automationId: automation.id,
      accountId: message.accountId,
      threadId: message.threadId,
      messageId: message.id,
      source,
      from: message.from,
      subject: message.subject,
      actions: [...actions],
      createdAt,
      undoneAt: null,
    };
  }
}
