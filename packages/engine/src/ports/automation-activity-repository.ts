import type {
  AutomationActivity,
  AutomationActivityId,
  AutomationId,
  UserId,
} from '@relay/shared/domain';

export interface AutomationActivityRecord extends AutomationActivity {
  readonly userId: UserId;
}

export interface AutomationActivityRetention {
  readonly olderThan: string;
  readonly keep: number;
}

export interface AutomationActivityStats {
  readonly runs: number;
  readonly failedActions: number;
}

export interface AutomationActivityRepository {
  append(record: AutomationActivityRecord, retention: AutomationActivityRetention): Promise<void>;
  listRecent(
    userId: UserId,
    automationId: AutomationId,
    limit: number,
  ): Promise<AutomationActivity[]>;
  listOpenSince(
    userId: UserId,
    automationId: AutomationId,
    since: string,
  ): Promise<AutomationActivity[]>;
  stats(
    userId: UserId,
    automationId: AutomationId,
    since: string,
  ): Promise<AutomationActivityStats>;
  findById(userId: UserId, id: AutomationActivityId): Promise<AutomationActivity | null>;
  markUndone(userId: UserId, id: AutomationActivityId, at: string): Promise<boolean>;
}
