import type { Logger } from '@relay/engine';
import PgBoss from 'pg-boss';
import type { JobHandler, JobQueue, QueueDefinition, SendOptions } from './job-queue';

export interface PgBossJobQueueOptions {
  readonly connectionString: string;
  readonly pollingIntervalSeconds: number;
}

export class PgBossJobQueue implements JobQueue {
  private readonly boss: PgBoss;
  private readonly workers = new Map<string, string>();
  private readonly queues = new Map<string, Promise<void>>();
  private started: Promise<void> | null = null;

  constructor(
    private readonly options: PgBossJobQueueOptions,
    private readonly logger: Logger,
  ) {
    this.boss = new PgBoss({
      connectionString: options.connectionString,
      schema: 'pgboss',
      max: 4,
      application_name: 'relay-jobs',
    });
    this.boss.on('error', (error) => {
      this.logger.error('pg-boss error', { error });
    });
  }

  start(): Promise<void> {
    this.started ??= this.boss.start().then(() => undefined);
    return this.started;
  }

  async stop(): Promise<void> {
    if (this.started === null) {
      return;
    }
    await this.started;
    await this.boss.stop({ graceful: true, wait: true, timeout: 10_000 });
  }

  async register(definition: QueueDefinition, handler: JobHandler): Promise<void> {
    await this.ensureQueue(definition);
    const workerId = await this.boss.work<unknown>(
      definition.name,
      { batchSize: 1, pollingIntervalSeconds: this.options.pollingIntervalSeconds },
      async (jobs) => {
        for (const job of jobs) {
          await handler(job.data);
        }
      },
    );
    this.workers.set(definition.name, workerId);
  }

  async send(definition: QueueDefinition, data: object, options: SendOptions = {}): Promise<void> {
    await this.ensureQueue(definition);
    const id = await this.boss.send(
      definition.name,
      data,
      options.singletonKey === undefined ? {} : { singletonKey: options.singletonKey },
    );
    const workerId = this.workers.get(definition.name);
    if (id !== null && workerId !== undefined) {
      this.boss.notifyWorker(workerId);
    }
  }

  private ensureQueue(definition: QueueDefinition): Promise<void> {
    const existing = this.queues.get(definition.name);
    if (existing !== undefined) {
      return existing;
    }
    const created = this.start().then(() =>
      this.boss.createQueue(definition.name, {
        name: definition.name,
        policy: definition.policy,
        retryLimit: definition.retryLimit,
        expireInSeconds: definition.expireInSeconds,
      }),
    );
    this.queues.set(definition.name, created);
    return created;
  }
}
