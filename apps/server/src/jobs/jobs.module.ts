import { Global, Module } from '@nestjs/common';
import { type Logger, PORT_TOKENS } from '@relay/engine';
import { SERVER_CONFIG, type ServerConfig } from '../config/server-config';
import { ImapIdleManager } from './idle/imap-idle-manager';
import { JobTicker } from './job-ticker';
import { JobWorkers } from './job-workers';
import { JobsLifecycle } from './jobs-lifecycle';
import { JOB_QUEUE } from './queue/job-queue';
import { NoopJobQueue } from './queue/noop-job-queue';
import { PgBossJobQueue } from './queue/pg-boss-job-queue';
import { SyncScheduler } from './sync/sync-scheduler';
import { SyncTrigger } from './sync/sync-trigger';

@Global()
@Module({
  providers: [
    {
      provide: JOB_QUEUE,
      inject: [SERVER_CONFIG, PORT_TOKENS.Logger],
      useFactory: (config: ServerConfig, logger: Logger) =>
        config.jobs.enabled
          ? new PgBossJobQueue(
              {
                connectionString: config.database.url,
                pollingIntervalSeconds: config.jobs.pollingIntervalSeconds,
              },
              logger,
            )
          : new NoopJobQueue(logger),
    },
    SyncTrigger,
    SyncScheduler,
    JobWorkers,
    JobTicker,
    JobsLifecycle,
    ImapIdleManager,
  ],
  exports: [SyncTrigger, JobTicker, ImapIdleManager, JOB_QUEUE],
})
export class JobsModule {}
