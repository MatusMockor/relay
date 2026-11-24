import type { MessageId } from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';

export interface RemoteBody {
  readonly textBody: string | null;
  readonly htmlBody: string | null;
}

export interface RemoteBodyCacheLimits {
  readonly maxBytes: number;
  readonly maxEntries: number;
  readonly ttlMs: number;
}

interface CachedBody {
  readonly body: RemoteBody;
  readonly bytes: number;
  readonly expiresAt: number;
}

export const remoteBodyBytes = (body: RemoteBody): number =>
  2 * ((body.textBody?.length ?? 0) + (body.htmlBody?.length ?? 0));

export class RemoteBodyCache {
  private readonly entries = new Map<MessageId, CachedBody>();
  private totalBytes = 0;

  constructor(
    private readonly clock: Clock,
    private readonly limits: RemoteBodyCacheLimits,
  ) {}

  get(messageId: MessageId): RemoteBody | null {
    const cached = this.entries.get(messageId);
    if (cached === undefined) {
      return null;
    }
    this.remove(messageId);
    if (cached.expiresAt <= this.now()) {
      return null;
    }
    this.insert(messageId, cached);
    return cached.body;
  }

  set(messageId: MessageId, body: RemoteBody): void {
    this.remove(messageId);
    const bytes = remoteBodyBytes(body);
    if (bytes > this.limits.maxBytes) {
      return;
    }
    this.insert(messageId, { body, bytes, expiresAt: this.now() + this.limits.ttlMs });
    this.evict();
  }

  size(): number {
    return this.entries.size;
  }

  bytes(): number {
    return this.totalBytes;
  }

  private insert(messageId: MessageId, cached: CachedBody): void {
    this.entries.set(messageId, cached);
    this.totalBytes += cached.bytes;
  }

  private remove(messageId: MessageId): void {
    const cached = this.entries.get(messageId);
    if (cached === undefined) {
      return;
    }
    this.entries.delete(messageId);
    this.totalBytes -= cached.bytes;
  }

  private evict(): void {
    for (const messageId of this.entries.keys()) {
      if (this.totalBytes <= this.limits.maxBytes && this.entries.size <= this.limits.maxEntries) {
        return;
      }
      this.remove(messageId);
    }
  }

  private now(): number {
    return this.clock.now().getTime();
  }
}
