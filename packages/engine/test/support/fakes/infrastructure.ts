import { isDeepStrictEqual } from 'node:util';
import type {
  AccountCredentials,
  AccountId,
  AttachmentId,
  DraftAttachment,
  EntityIdMap,
  EntityKind,
  UserId,
} from '@relay/shared/domain';
import type { RealtimeEvent, RealtimeEventOf, RealtimeEventType } from '@relay/shared/realtime';
import type {
  AttachmentStore,
  AttachmentUpload,
  Clock,
  ConditionalCredentialVault,
  EventPublisher,
  IdGenerator,
  LogContext,
  Logger,
  StoredAttachment,
} from '../../../src';

export class ManualClock implements Clock {
  private current: number;

  constructor(start: string) {
    this.current = Date.parse(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(iso: string): void {
    this.current = Date.parse(iso);
  }

  advance(milliseconds: number): void {
    this.current += milliseconds;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  generate<Kind extends EntityKind>(kind: Kind): EntityIdMap[Kind] {
    this.counter += 1;
    return `${kind}_${this.counter}` as EntityIdMap[Kind];
  }
}

export interface PublishedEvent {
  readonly userId: UserId;
  readonly event: RealtimeEvent;
}

export class RecordingEventPublisher implements EventPublisher {
  readonly published: PublishedEvent[] = [];

  publish(userId: UserId, event: RealtimeEvent): Promise<void> {
    this.published.push({ userId, event });
    return Promise.resolve();
  }

  ofType<Type extends RealtimeEventType>(type: Type): RealtimeEventOf<Type>[] {
    return this.published
      .map((entry) => entry.event)
      .filter((event): event is RealtimeEventOf<Type> => event.type === type);
  }

  clear(): void {
    this.published.length = 0;
  }
}

export interface LogEntry {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
  readonly context: LogContext;
}

export class MemoryLogger implements Logger {
  constructor(
    readonly entries: LogEntry[] = [],
    private readonly bindings: LogContext = {},
  ) {}

  debug(message: string, context: LogContext = {}): void {
    this.write('debug', message, context);
  }

  info(message: string, context: LogContext = {}): void {
    this.write('info', message, context);
  }

  warn(message: string, context: LogContext = {}): void {
    this.write('warn', message, context);
  }

  error(message: string, context: LogContext = {}): void {
    this.write('error', message, context);
  }

  child(bindings: LogContext): Logger {
    return new MemoryLogger(this.entries, { ...this.bindings, ...bindings });
  }

  private write(level: LogEntry['level'], message: string, context: LogContext): void {
    this.entries.push({ level, message, context: { ...this.bindings, ...context } });
  }
}

export class MemoryCredentialVault implements ConditionalCredentialVault {
  readonly entries = new Map<AccountId, AccountCredentials>();

  get(accountId: AccountId): Promise<AccountCredentials | null> {
    return Promise.resolve(this.entries.get(accountId) ?? null);
  }

  set(accountId: AccountId, credentials: AccountCredentials): Promise<void> {
    this.entries.set(accountId, credentials);
    return Promise.resolve();
  }

  setIfUnchanged(
    accountId: AccountId,
    expected: AccountCredentials,
    next: AccountCredentials,
  ): Promise<boolean> {
    if (!isDeepStrictEqual(this.entries.get(accountId) ?? null, expected)) {
      return Promise.resolve(false);
    }
    this.entries.set(accountId, next);
    return Promise.resolve(true);
  }

  delete(accountId: AccountId): Promise<void> {
    this.entries.delete(accountId);
    return Promise.resolve();
  }
}

export class MemoryAttachmentStore implements AttachmentStore {
  readonly entries = new Map<AttachmentId, { userId: UserId; stored: StoredAttachment }>();
  failDeletes: string | null = null;

  constructor(private readonly ids: IdGenerator) {}

  put(userId: UserId, upload: AttachmentUpload): Promise<DraftAttachment> {
    const attachment: DraftAttachment = {
      id: this.ids.generate('attachment'),
      filename: upload.filename,
      contentType: upload.contentType,
      size: upload.content.byteLength,
    };
    this.entries.set(attachment.id, { userId, stored: { attachment, content: upload.content } });
    return Promise.resolve(attachment);
  }

  get(userId: UserId, attachmentId: AttachmentId): Promise<StoredAttachment | null> {
    const entry = this.entries.get(attachmentId);
    return Promise.resolve(entry?.userId === userId ? entry.stored : null);
  }

  delete(userId: UserId, attachmentId: AttachmentId): Promise<boolean> {
    if (this.failDeletes !== null) {
      return Promise.reject(new Error(this.failDeletes));
    }
    if (this.entries.get(attachmentId)?.userId !== userId) {
      return Promise.resolve(false);
    }
    return Promise.resolve(this.entries.delete(attachmentId));
  }
}
