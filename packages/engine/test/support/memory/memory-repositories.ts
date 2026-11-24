import { AsyncLocalStorage } from 'node:async_hooks';
import type { Repositories, UnitOfWork } from '../../../src';
import { MemoryAccountRepository } from './memory-account-repository';
import { MemoryAutomationActivityRepository } from './memory-automation-activity-repository';
import {
  MemoryAutomationRepository,
  MemoryAutomationRunRepository,
} from './memory-automation-repositories';
import {
  MemoryCalendarEventRepository,
  MemoryCalendarSubscriptionRepository,
} from './memory-calendar-repositories';
import type { MemoryDatabase } from './memory-database';
import { MemoryDraftRepository } from './memory-draft-repository';
import {
  MemoryGoogleCalendarRepository,
  MemoryGoogleConnectionRepository,
} from './memory-google-connection-repositories';
import { MemoryGoogleEventRepository } from './memory-google-event-repository';
import { MemoryAutomationCandidateRepository } from './memory-automation-candidate-repository';
import { MemoryInviteCandidateRepository } from './memory-invite-candidate-repository';
import { MemoryLabelRepository } from './memory-label-repository';
import { MemoryMailboxRepository } from './memory-mailbox-repository';
import { MemoryEmailIdResolutions, MemoryMessageMerges } from './memory-message-merges';
import { MemoryMessageRepository } from './memory-message-repository';
import { MemoryPendingWorkRepository } from './memory-pending-work-repository';
import { MemoryReminderRepository } from './memory-reminder-repository';
import { MemoryScheduledSendRepository } from './memory-scheduled-send-repository';
import {
  MemoryAiJobRepository,
  MemoryAiResultRepository,
  MemorySettingsRepository,
  MemorySyncStateRepository,
} from './memory-small-repositories';
import { MemorySplitRepository } from './memory-split-repository';
import { MemoryTaskRepository } from './memory-task-repository';
import { MemoryTaskSystemConnectionRepository } from './memory-task-system-connection-repository';
import { MemoryThreadRepository } from './memory-thread-repository';

export const createMemoryRepositories = (db: MemoryDatabase): Repositories => ({
  accounts: new MemoryAccountRepository(db),
  mailboxes: new MemoryMailboxRepository(db),
  messages: new MemoryMessageRepository(db),
  messageMerges: new MemoryMessageMerges(),
  emailIdResolutions: new MemoryEmailIdResolutions(),
  threads: new MemoryThreadRepository(db),
  labels: new MemoryLabelRepository(db),
  splits: new MemorySplitRepository(db),
  automations: new MemoryAutomationRepository(db),
  automationRuns: new MemoryAutomationRunRepository(db),
  automationActivity: new MemoryAutomationActivityRepository(db),
  automationCandidates: new MemoryAutomationCandidateRepository(db),
  tasks: new MemoryTaskRepository(db),
  reminders: new MemoryReminderRepository(db),
  drafts: new MemoryDraftRepository(db),
  scheduledSends: new MemoryScheduledSendRepository(db),
  settings: new MemorySettingsRepository(db),
  aiResults: new MemoryAiResultRepository(db),
  aiJobs: new MemoryAiJobRepository(db),
  syncStates: new MemorySyncStateRepository(db),
  pendingWork: new MemoryPendingWorkRepository(db),
  calendarEvents: new MemoryCalendarEventRepository(db),
  calendarSubscriptions: new MemoryCalendarSubscriptionRepository(db),
  googleConnections: new MemoryGoogleConnectionRepository(db),
  googleCalendars: new MemoryGoogleCalendarRepository(db),
  googleEvents: new MemoryGoogleEventRepository(db),
  inviteCandidates: new MemoryInviteCandidateRepository(db),
  taskSystemConnections: new MemoryTaskSystemConnectionRepository(db),
});

export class MemoryUnitOfWork implements UnitOfWork {
  runs = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly active = new AsyncLocalStorage<true>();

  constructor(
    private readonly db: MemoryDatabase,
    private readonly repositories: Repositories,
  ) {}

  run<Result>(work: (repositories: Repositories) => Promise<Result>): Promise<Result> {
    this.runs += 1;
    if (this.active.getStore() === true) {
      return this.isolated(work);
    }
    const next = this.tail.then(() => this.active.run(true, () => this.isolated(work)));
    this.tail = next.catch(() => undefined);
    return next;
  }

  private async isolated<Result>(
    work: (repositories: Repositories) => Promise<Result>,
  ): Promise<Result> {
    const snapshot = this.db.snapshot();
    try {
      return await work(this.repositories);
    } catch (error) {
      this.db.restore(snapshot);
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
