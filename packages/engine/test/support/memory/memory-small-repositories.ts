import type {
  AccountId,
  AiJob,
  AiJobId,
  AiJobStatus,
  AiResult,
  AiResultId,
  AiRunnerLocation,
  AiTaskKind,
  MailboxId,
  ThreadId,
  UserId,
  UserSettings,
} from '@relay/shared/domain';
import { applyChecklistChange } from '../../../src';
import type {
  AiJobClaim,
  AiJobEnqueueResult,
  ChecklistItemChange,
  AiJobRepository,
  AiJobUpdate,
  QueuedAiJobQuery,
  AiResultRepository,
  MailboxSyncState,
  SettingsRepository,
  SyncStateRepository,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemorySettingsRepository implements SettingsRepository {
  constructor(private readonly db: MemoryDatabase) {}

  find(userId: UserId): Promise<UserSettings | null> {
    return Promise.resolve(this.db.tables.settings.get(userId) ?? null);
  }

  save(userId: UserId, settings: UserSettings): Promise<UserSettings> {
    this.db.tables.settings.set(userId, settings);
    return Promise.resolve(settings);
  }
}

export class MemoryAiResultRepository implements AiResultRepository {
  constructor(private readonly db: MemoryDatabase) {}

  findLatest(userId: UserId, threadId: ThreadId, kind: AiTaskKind): Promise<AiResult | null> {
    const match = [...this.db.tables.aiResults]
      .reverse()
      .find(
        (result) =>
          result.userId === userId && result.threadId === threadId && result.output.kind === kind,
      );
    return Promise.resolve(match ?? null);
  }

  save(result: AiResult): Promise<AiResult> {
    this.db.tables.aiResults.push(result);
    return Promise.resolve(result);
  }

  updateChecklistItem(
    userId: UserId,
    resultId: AiResultId,
    change: ChecklistItemChange,
  ): Promise<AiResult | null> {
    const results = this.db.tables.aiResults;
    const index = results.findIndex((result) => result.id === resultId && result.userId === userId);
    const current = results[index];
    const output = current === undefined ? null : applyChecklistChange(current.output, change);
    if (current === undefined || output === null) {
      return Promise.resolve(null);
    }
    const updated = { ...current, output };
    results.splice(index, 1, updated);
    return Promise.resolve(updated);
  }

  deleteByThread(threadId: ThreadId): Promise<void> {
    const kept = this.db.tables.aiResults.filter((result) => result.threadId !== threadId);
    this.db.tables.aiResults.splice(0, this.db.tables.aiResults.length, ...kept);
    return Promise.resolve();
  }
}

const ACTIVE_STATUSES: readonly AiJobStatus[] = ['queued', 'running'];

const sourceOf = (job: AiJob): string | null =>
  'sourceMessageId' in job.input ? (job.input.sourceMessageId ?? null) : null;

export class MemoryAiJobRepository implements AiJobRepository {
  private readonly unindexed = new Set<AiJobId>();

  constructor(private readonly db: MemoryDatabase) {}

  findById(userId: UserId, jobId: AiJobId): Promise<AiJob | null> {
    const job = this.db.tables.aiJobs.get(jobId);
    return Promise.resolve(job?.userId === userId ? job : null);
  }

  create(job: AiJob, claim?: AiJobClaim): Promise<AiJob> {
    this.db.tables.aiJobs.set(job.id, job);
    if (claim !== undefined) {
      this.unindexed.add(job.id);
      this.db.tables.aiJobLeases.set(job.id, { owner: claim.owner, leaseUntil: claim.leaseUntil });
    }
    return Promise.resolve(job);
  }

  claim(jobId: AiJobId, claim: AiJobClaim): Promise<AiJob | null> {
    const job = this.db.tables.aiJobs.get(jobId);
    if (job === undefined || !this.claimable(job, claim.now)) {
      return Promise.resolve(null);
    }
    if (claim.location !== undefined && job.runnerLocation !== claim.location) {
      return Promise.resolve(null);
    }
    const claimed: AiJob = { ...job, status: 'running', updatedAt: claim.now };
    this.db.tables.aiJobs.set(jobId, claimed);
    this.db.tables.aiJobLeases.set(jobId, { owner: claim.owner, leaseUntil: claim.leaseUntil });
    return Promise.resolve(claimed);
  }

  listQueued(query: QueuedAiJobQuery): Promise<AiJob[]> {
    const jobs = [...this.db.tables.aiJobs.values()]
      .filter(
        (job) =>
          job.runnerLocation === query.location &&
          (query.userId === undefined || job.userId === query.userId) &&
          this.claimable(job, query.now),
      )
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return Promise.resolve(jobs.slice(0, query.limit));
  }

  enqueueIfAbsent(job: AiJob): Promise<AiJobEnqueueResult> {
    const source = sourceOf(job);
    const active = [...this.db.tables.aiJobs.values()].find(
      (existing) =>
        source !== null &&
        !this.unindexed.has(existing.id) &&
        existing.userId === job.userId &&
        existing.kind === job.kind &&
        ACTIVE_STATUSES.includes(existing.status) &&
        sourceOf(existing) === source &&
        'threadId' in existing.input &&
        'threadId' in job.input &&
        existing.input.threadId === job.input.threadId,
    );
    if (active !== undefined) {
      return Promise.resolve({ job: active, created: false });
    }
    this.db.tables.aiJobs.set(job.id, job);
    return Promise.resolve({ job, created: true });
  }

  lockResultSlot(): Promise<void> {
    return Promise.resolve();
  }

  hasNewerDone(job: AiJob): Promise<boolean> {
    const threadOf = (candidate: AiJob) =>
      'threadId' in candidate.input ? candidate.input.threadId : null;
    return Promise.resolve(
      [...this.db.tables.aiJobs.values()].some(
        (other) =>
          other.id !== job.id &&
          other.userId === job.userId &&
          other.kind === job.kind &&
          other.status === 'done' &&
          threadOf(other) === threadOf(job) &&
          Date.parse(other.createdAt) > Date.parse(job.createdAt),
      ),
    );
  }

  relocateQueued(userId: UserId, location: AiRunnerLocation, updatedAt: string): Promise<AiJob[]> {
    const moved = [...this.db.tables.aiJobs.values()]
      .filter(
        (job) =>
          job.userId === userId && job.status === 'queued' && job.runnerLocation !== location,
      )
      .map((job) => ({ ...job, runnerLocation: location, updatedAt }));
    moved.forEach((job) => this.db.tables.aiJobs.set(job.id, job));
    return Promise.resolve(moved);
  }

  private claimable(job: AiJob, now: string): boolean {
    if (job.status === 'queued') {
      return true;
    }
    const lease = this.db.tables.aiJobLeases.get(job.id);
    return (
      job.status === 'running' &&
      lease !== undefined &&
      Date.parse(lease.leaseUntil) < Date.parse(now)
    );
  }

  update(jobId: AiJobId, update: AiJobUpdate): Promise<AiJob | null> {
    const job = this.db.tables.aiJobs.get(jobId);
    const lease = this.db.tables.aiJobLeases.get(jobId);
    if (job === undefined || (update.owner !== undefined && lease?.owner !== update.owner)) {
      return Promise.resolve(null);
    }
    if (update.fromStatus !== undefined && job.status !== update.fromStatus) {
      return Promise.resolve(null);
    }
    if (update.owner !== undefined && update.leaseUntil !== undefined) {
      this.db.tables.aiJobLeases.set(jobId, { owner: update.owner, leaseUntil: update.leaseUntil });
    }
    const next: AiJob = {
      ...job,
      status: update.status,
      output: update.output === undefined ? job.output : update.output,
      error: update.error === undefined ? job.error : update.error,
      updatedAt: update.updatedAt,
    };
    this.db.tables.aiJobs.set(jobId, next);
    return Promise.resolve(next);
  }
}

export class MemorySyncStateRepository implements SyncStateRepository {
  constructor(private readonly db: MemoryDatabase) {}

  find(mailboxId: MailboxId): Promise<MailboxSyncState | null> {
    return Promise.resolve(this.db.tables.syncStates.get(mailboxId) ?? null);
  }

  listByAccount(accountId: AccountId): Promise<MailboxSyncState[]> {
    return Promise.resolve(
      [...this.db.tables.syncStates.values()].filter((state) => state.accountId === accountId),
    );
  }

  save(state: MailboxSyncState): Promise<void> {
    this.db.tables.syncStates.set(state.mailboxId, state);
    return Promise.resolve();
  }

  delete(mailboxId: MailboxId): Promise<void> {
    this.db.tables.syncStates.delete(mailboxId);
    return Promise.resolve();
  }
}
