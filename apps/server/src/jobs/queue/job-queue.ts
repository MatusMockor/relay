export const JOB_QUEUE = Symbol.for('relay.server.JobQueue');

export type QueuePolicy = 'standard' | 'stately';

export interface QueueDefinition {
  readonly name: string;
  readonly policy: QueuePolicy;
  readonly retryLimit: number;
  readonly expireInSeconds: number;
}

export interface SendOptions {
  readonly singletonKey?: string;
}

export type JobHandler = (data: unknown) => Promise<void>;

export interface JobQueue {
  register(definition: QueueDefinition, handler: JobHandler): Promise<void>;
  send(definition: QueueDefinition, data: object, options?: SendOptions): Promise<void>;
}
