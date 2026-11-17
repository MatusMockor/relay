import type { CreateAiJobBody } from '@relay/shared/api';
import type { AiJob, AiJobInput, AiRunnerLocation, UserId } from '@relay/shared/domain';
import { ConflictError, NotFoundError } from '../../errors';
import type {
  AiJobClaim,
  AiJobEnqueueResult,
  AiJobRepository,
} from '../../ports/ai-job-repository';
import type { Clock } from '../../ports/clock';
import type { DraftRepository } from '../../ports/draft-repository';
import type { IdGenerator } from '../../ports/id-generator';
import type { MessageRepository } from '../../ports/message-repository';
import type { ThreadRepository } from '../../ports/thread-repository';
import type { EngineEvents } from '../shared/engine-events';
import { latestThreadMessage } from '../shared/latest-thread-message';
import type { UserSettingsReader } from '../shared/user-settings-reader';
import { assertAiFeatureEnabled } from './ai-feature-gate';
import { draftIdOf, isThreadScoped, threadIdOf } from './ai-input-context';

export interface AiJobFactoryDeps {
  readonly jobs: AiJobRepository;
  readonly settings: UserSettingsReader;
  readonly threads: ThreadRepository;
  readonly messages: MessageRepository;
  readonly drafts: DraftRepository;
  readonly events: EngineEvents;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class AiJobFactory {
  constructor(private readonly deps: AiJobFactoryDeps) {}

  async create(
    userId: UserId,
    body: CreateAiJobBody,
    location: AiRunnerLocation | null,
    claim?: AiJobClaim,
  ): Promise<AiJob> {
    if (claim === undefined) {
      return this.joinOrCreate(userId, body, location);
    }
    const job = await this.deps.jobs.create(await this.build(userId, body, location, claim), claim);
    await this.deps.events.emit(userId, 'ai.job.updated', { job });
    return job;
  }

  async enqueue(
    userId: UserId,
    body: CreateAiJobBody,
    location: AiRunnerLocation | null = null,
  ): Promise<AiJobEnqueueResult> {
    const result = await this.deps.jobs.enqueueIfAbsent(await this.build(userId, body, location));
    if (result.created && result.job !== null) {
      await this.deps.events.emit(userId, 'ai.job.updated', { job: result.job });
    }
    return result;
  }

  private async joinOrCreate(
    userId: UserId,
    body: CreateAiJobBody,
    location: AiRunnerLocation | null,
  ): Promise<AiJob> {
    const { job } = await this.enqueue(userId, body, location);
    if (job === null) {
      throw new ConflictError('An equal AI job finished while it was being queued');
    }
    return job;
  }

  private async build(
    userId: UserId,
    body: CreateAiJobBody,
    location: AiRunnerLocation | null,
    claim?: AiJobClaim,
  ): Promise<AiJob> {
    const settings = await this.deps.settings.read(userId);
    assertAiFeatureEnabled(settings, body.input.kind);
    await this.assertReferences(userId, body);
    const now = this.deps.clock.now().toISOString();
    return {
      id: this.deps.ids.generate('aiJob'),
      userId,
      kind: body.input.kind,
      status: claim === undefined ? 'queued' : 'running',
      runnerLocation: location ?? settings.ai.location,
      runner: body.runner ?? settings.ai.defaultRunner,
      ...(body.model === undefined || body.model === null ? {} : { model: body.model }),
      ...(body.effort === undefined || body.effort === null ? {} : { effort: body.effort }),
      input: await this.withSource(userId, body.input),
      output: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private async withSource(userId: UserId, input: AiJobInput): Promise<AiJobInput> {
    if (!isThreadScoped(input) || typeof input.sourceMessageId === 'string') {
      return input;
    }
    const latest = await latestThreadMessage(this.deps.messages, userId, input.threadId);
    return { ...input, sourceMessageId: latest?.id ?? null };
  }

  private async assertReferences(userId: UserId, body: CreateAiJobBody): Promise<void> {
    const threadId = threadIdOf(body.input);
    if (threadId !== null && (await this.deps.threads.findById(userId, threadId)) === null) {
      throw new NotFoundError('Thread', threadId);
    }
    const draftId = draftIdOf(body.input);
    if (draftId !== null && (await this.deps.drafts.findById(userId, draftId)) === null) {
      throw new NotFoundError('Draft', draftId);
    }
  }
}
