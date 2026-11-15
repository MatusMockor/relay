import type { AiOptions, EngineDeps } from '../../engine-deps';
import type { EngineEvents } from '../shared/engine-events';
import type { UserSettingsReader } from '../shared/user-settings-reader';
import { AiTaskBuilder } from '../tasks/ai-task-builder';
import type { ThreadQueryService } from '../threads/thread-query-service';
import { AiJobExecutor } from './ai-job-executor';
import { AiJobFactory } from './ai-job-factory';
import { AiJobLease } from './ai-job-lease';
import { AiJobStatusWriter } from './ai-job-status-writer';
import { AiRequestBuilder } from './ai-request-builder';
import { AiResultApplier } from './ai-result-applier';
import { AiJobCompleter } from './ai-job-completer';
import { AiService } from './ai-service';
import { ExternalAiJobClaims } from './external-ai-job-claims';
import { ExternalAiJobSettlement } from './external-ai-job-settlement';
import { EXTERNAL_AI_LEASE_MS } from './external-ai-lease';
import { OneLinerScheduler } from './one-liner-scheduler';
import { QueuedAiJobRelocator } from './queued-ai-job-relocator';

export const DEFAULT_AI_OPTIONS: AiOptions = {
  timeoutMs: 120_000,
  mailTools: null,
  oneLinersPerSync: 20,
  workerId: null,
};

const LEASE_MARGIN_MS = 60_000;

export interface AiComponents {
  readonly service: AiService;
  readonly oneLiners: OneLinerScheduler;
  readonly relocator: QueuedAiJobRelocator;
}

export const createAiComponents = (
  deps: EngineDeps,
  shared: {
    readonly events: EngineEvents;
    readonly threads: ThreadQueryService;
    readonly settings: UserSettingsReader;
  },
): AiComponents => {
  const { repositories, clock, idGenerator: ids, logger } = deps;
  const options: AiOptions = { ...DEFAULT_AI_OPTIONS, ...deps.options.ai };
  const location = deps.options.aiRunnerLocation;
  const factory = new AiJobFactory({
    jobs: repositories.aiJobs,
    settings: shared.settings,
    threads: repositories.threads,
    messages: repositories.messages,
    drafts: repositories.drafts,
    events: shared.events,
    clock,
    ids,
  });
  const owner = options.workerId ?? `${location}-${ids.generate('aiJob')}`;
  const lease = new AiJobLease(owner, clock, options.timeoutMs + LEASE_MARGIN_MS, location);
  const writer = new AiJobStatusWriter({ jobs: repositories.aiJobs, events: shared.events, clock });
  const results = new AiResultApplier({
    events: shared.events,
    tasks: new AiTaskBuilder(clock, ids),
    clock,
    ids,
  });
  const completer = new AiJobCompleter({
    unitOfWork: deps.unitOfWork,
    results,
    events: shared.events,
    clock,
  });
  const executor = new AiJobExecutor({
    jobs: repositories.aiJobs,
    runners: deps.aiRunnerRegistry,
    requests: new AiRequestBuilder(shared.threads, options),
    completer,
    writer,
    lease,
    logger,
  });
  const externalClaims = new ExternalAiJobClaims({
    jobs: repositories.aiJobs,
    settings: shared.settings,
    threads: shared.threads,
    writer,
    events: shared.events,
    clock,
    ids,
    logger,
    leaseMs: EXTERNAL_AI_LEASE_MS,
  });
  const externalSettlement = new ExternalAiJobSettlement({
    jobs: repositories.aiJobs,
    writer,
    completer,
    clock,
    leaseMs: EXTERNAL_AI_LEASE_MS,
  });
  const relocator = new QueuedAiJobRelocator({
    jobs: repositories.aiJobs,
    events: shared.events,
    clock,
  });
  const service = new AiService({
    jobs: repositories.aiJobs,
    settings: shared.settings,
    relocator,
    factory,
    executor,
    lease,
    externalClaims,
    externalSettlement,
    runners: deps.aiRunnerRegistry,
    location,
    clock,
    logger,
  });
  const oneLiners = new OneLinerScheduler({
    settings: shared.settings,
    threads: repositories.threads,
    aiResults: repositories.aiResults,
    factory,
    logger,
    limitPerSync: options.oneLinersPerSync,
  });
  return { service, oneLiners, relocator };
};
