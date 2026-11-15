import type { Logger } from '@relay/engine';
import type { JobQueue, QueueDefinition } from './job-queue';

export class NoopJobQueue implements JobQueue {
  constructor(private readonly logger: Logger) {}

  register(_definition: QueueDefinition): Promise<void> {
    return Promise.resolve();
  }

  send(definition: QueueDefinition): Promise<void> {
    this.logger.debug('Jobs are disabled, dropping job', { queue: definition.name });
    return Promise.resolve();
  }
}
