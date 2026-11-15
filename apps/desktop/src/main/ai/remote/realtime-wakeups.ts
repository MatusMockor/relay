import type { Logger } from '@relay/engine';
import { API_VERSION } from '@relay/shared/api';
import { REALTIME_PATH, ServerMessageSchema, type ServerMessage } from '@relay/shared/realtime';
import type { TimerHandle, Timers } from '../../platform/timers';
import type { ServerSession } from './server-session';
import { canonicalServerUrl } from './server-session-key';

export interface RealtimeWakeupsDeps {
  readonly serverUrl: string;
  readonly session: ServerSession;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly onWake: () => void;
  readonly retryMs?: { readonly min: number; readonly max: number };
}

const DEFAULT_RETRY = { min: 5_000, max: 60_000 };

const wantsWake = (message: ServerMessage): boolean => {
  if (message.type !== 'event') {
    return false;
  }
  if (message.event.type === 'settings.updated') {
    return true;
  }
  if (message.event.type !== 'ai.job.updated') {
    return false;
  }
  const { job } = message.event.data;
  return job.runnerLocation === 'local' && job.status === 'queued';
};

const parseMessage = (data: unknown): ServerMessage | null => {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const parsed = ServerMessageSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export class RealtimeWakeups {
  private socket: WebSocket | null = null;
  private retry: TimerHandle | null = null;
  private delayMs: number;
  private active = false;

  constructor(private readonly deps: RealtimeWakeupsDeps) {
    this.delayMs = (deps.retryMs ?? DEFAULT_RETRY).min;
  }

  start(): void {
    this.active = true;
    void this.connect();
  }

  stop(): void {
    this.active = false;
    this.retry?.cancel();
    this.retry = null;
    this.socket?.close();
    this.socket = null;
  }

  private async connect(): Promise<void> {
    const token = await this.deps.session.accessToken().catch(() => null);
    if (!this.active) {
      return;
    }
    if (token === null) {
      this.reconnectLater();
      return;
    }
    const url = `${canonicalServerUrl(this.deps.serverUrl).replace(/^http/, 'ws')}${REALTIME_PATH}`;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'hello', apiVersion: API_VERSION, accessToken: token }));
    });
    socket.addEventListener('message', (event) => {
      this.onMessage(parseMessage(event.data));
    });
    socket.addEventListener('close', () => {
      if (this.socket === socket) {
        this.socket = null;
        this.reconnectLater();
      }
    });
    socket.addEventListener('error', () => {
      socket.close();
    });
  }

  private onMessage(message: ServerMessage | null): void {
    if (message === null) {
      return;
    }
    if (message.type === 'welcome') {
      this.delayMs = (this.deps.retryMs ?? DEFAULT_RETRY).min;
      this.deps.onWake();
      return;
    }
    if (wantsWake(message)) {
      this.deps.onWake();
    }
  }

  private reconnectLater(): void {
    if (!this.active) {
      return;
    }
    const delay = this.delayMs;
    this.delayMs = Math.min(delay * 2, (this.deps.retryMs ?? DEFAULT_RETRY).max);
    this.retry = this.deps.timers.after(delay, () => {
      this.retry = null;
      void this.connect();
    });
  }
}
