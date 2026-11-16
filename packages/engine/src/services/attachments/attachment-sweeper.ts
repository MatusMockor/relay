import type { AttachmentId } from '@relay/shared/domain';
import type { AttachmentBlobCatalog } from '../../ports/attachment-blob-catalog';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { AttachmentReferenceLock } from './attachment-reference-lock';
import type { AttachmentSweepOptions } from './attachment-sweep-options';

export interface AttachmentSweeperDeps {
  readonly blobs: AttachmentBlobCatalog;
  readonly lock: AttachmentReferenceLock;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly options: AttachmentSweepOptions;
}

export class AttachmentSweeper {
  private running: Promise<number> | null = null;
  private lastStartedAt: number | null = null;

  constructor(private readonly deps: AttachmentSweeperDeps) {}

  sweepDue(): Promise<number> {
    const now = this.deps.clock.now().getTime();
    if (this.lastStartedAt !== null && now - this.lastStartedAt < this.deps.options.intervalMs) {
      return Promise.resolve(0);
    }
    return this.sweep();
  }

  sweep(): Promise<number> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async release(ids: readonly AttachmentId[]): Promise<number> {
    const unique = [...new Set(ids)];
    const { batchSize } = this.deps.options;
    let deleted = 0;
    for (let start = 0; start < unique.length; start += batchSize) {
      deleted += (await this.deleteUnreferenced(unique.slice(start, start + batchSize))).length;
    }
    return deleted;
  }

  private deleteUnreferenced(ids: readonly AttachmentId[]): Promise<AttachmentId[]> {
    return this.deps.lock.exclusive(() => this.deps.blobs.deleteUnreferenced(ids));
  }

  private async run(): Promise<number> {
    const startedAt = this.deps.clock.now().getTime();
    this.lastStartedAt = startedAt;
    const createdBefore = new Date(startedAt - this.deps.options.graceMs).toISOString();
    const deleted = await this.sweepFrom(createdBefore, null, 0);
    if (deleted > 0) {
      this.deps.logger.info('Removed unreferenced attachment blobs', { deleted });
    }
    return deleted;
  }

  private async sweepFrom(
    createdBefore: string,
    after: AttachmentId | null,
    deleted: number,
  ): Promise<number> {
    const { batchSize } = this.deps.options;
    const page = await this.deps.blobs.listCreatedBefore({
      createdBefore,
      after,
      limit: batchSize,
    });
    const last = page.at(-1);
    if (last === undefined) {
      return deleted;
    }
    const removed = await this.deleteUnreferenced(page.map((blob) => blob.id));
    if (page.length < batchSize) {
      return deleted + removed.length;
    }
    return this.sweepFrom(createdBefore, last.id, deleted + removed.length);
  }
}
