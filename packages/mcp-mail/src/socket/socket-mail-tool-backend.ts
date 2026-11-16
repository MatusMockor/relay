import { createConnection } from 'node:net';
import type { Page, TaskQuery, ThreadFolderQuery } from '@relay/engine';
import type {
  Draft,
  DraftContent,
  Task,
  ThreadDetail,
  ThreadId,
  ThreadSummary,
} from '@relay/shared/domain';
import type { z } from 'zod';
import type {
  CalendarEventsResult,
  CalendarRangeQuery,
  ThreadEventsResult,
} from '../backend/calendar-tool-types';
import type { MailToolBackend, NewMailTask } from '../backend/mail-tool-backend';
import { JsonLineChannel } from './json-line-channel';
import {
  HelloReplySchema,
  SOCKET_SCHEMAS,
  SocketResponseSchema,
  type SocketMethodName,
} from './socket-protocol';

export interface SocketBackendOptions {
  readonly handshakeTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
  readonly maxFrameBytes?: number;
}

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

export class SocketMailToolBackend implements MailToolBackend {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private closed = false;

  private constructor(
    private readonly channel: JsonLineChannel,
    private readonly requestTimeoutMs: number,
  ) {
    channel.onClose(() => {
      this.closed = true;
      this.failAll(new Error('Relay mail tools connection closed'));
    });
  }

  static async connect(
    path: string,
    token: string,
    options: SocketBackendOptions = {},
  ): Promise<SocketMailToolBackend> {
    const socket = createConnection(path);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.on('error', reject);
    });
    const channel = new JsonLineChannel(socket, options.maxFrameBytes);
    const backend = new SocketMailToolBackend(
      channel,
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    );
    await backend.handshake(token, options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS);
    return backend;
  }

  onClose(listener: () => void): void {
    this.channel.onClose(listener);
  }

  close(): void {
    this.channel.close();
  }

  listFolder(query: ThreadFolderQuery): Promise<Page<ThreadSummary>> {
    return this.call('listFolder', query, SOCKET_SCHEMAS.listFolder.result);
  }

  getThread(threadId: ThreadId): Promise<ThreadDetail | null> {
    return this.call('getThread', { threadId }, SOCKET_SCHEMAS.getThread.result);
  }

  listTasks(query: TaskQuery): Promise<Page<Task>> {
    return this.call('listTasks', query, SOCKET_SCHEMAS.listTasks.result);
  }

  createTask(task: NewMailTask): Promise<Task> {
    return this.call('createTask', task, SOCKET_SCHEMAS.createTask.result);
  }

  createDraft(content: DraftContent): Promise<Draft> {
    return this.call('createDraft', content, SOCKET_SCHEMAS.createDraft.result);
  }

  listEvents(range: CalendarRangeQuery): Promise<CalendarEventsResult> {
    return this.call('listEvents', range, SOCKET_SCHEMAS.listEvents.result);
  }

  getThreadEvents(threadId: ThreadId): Promise<ThreadEventsResult> {
    return this.call('getThreadEvents', { threadId }, SOCKET_SCHEMAS.getThreadEvents.result);
  }

  private handshake(token: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        fail(new Error('Relay mail tools handshake timed out'));
      }, timeoutMs);
      const fail = (error: Error) => {
        clearTimeout(timer);
        this.channel.destroy();
        reject(error);
      };
      const ready = () => {
        clearTimeout(timer);
        resolve();
      };
      this.channel.onClose(() => {
        fail(new Error('Relay mail tools connection closed before the handshake'));
      });
      this.channel.onMessage((message) => {
        this.receive(message, ready, fail);
      });
      this.channel.send({ type: 'hello', token });
    });
  }

  private receive(message: unknown, ready: () => void, rejected: (error: Error) => void): void {
    const hello = HelloReplySchema.safeParse(message);
    if (hello.success && hello.data.type === 'ready') {
      ready();
      return;
    }
    if (hello.success && hello.data.type === 'rejected') {
      rejected(new Error(hello.data.message));
      return;
    }
    const response = SocketResponseSchema.safeParse(message);
    const pending = response.success ? this.pending.get(response.data.id) : undefined;
    if (!response.success || pending === undefined) {
      return;
    }
    this.pending.delete(response.data.id);
    if (response.data.ok) {
      pending.resolve(response.data.result);
      return;
    }
    pending.reject(new Error(response.data.error));
  }

  private async call<T>(
    method: SocketMethodName,
    params: unknown,
    schema: z.ZodType<T>,
  ): Promise<T> {
    if (this.closed) {
      throw new Error('Relay mail tools connection closed');
    }
    const id = this.nextId++;
    const raw = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Relay mail tools request ${method} timed out`));
      }, this.requestTimeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.channel.send({ id, method, params });
    });
    return schema.parse(raw);
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}
