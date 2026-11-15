import {
  API_VERSION,
  REALTIME_PATH,
  type RealtimeEvent,
  type ServerMessage,
  ServerMessageSchema,
} from '@relay/shared';

export interface SocketLike {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: string): void;
  close(): void;
}

export type RealtimeStatus = 'connecting' | 'online' | 'offline';

export interface RealtimeOptions {
  readonly baseUrl: string;
  readonly accessToken: () => Promise<string | null>;
  readonly renewToken: (rejected: string) => Promise<unknown>;
  readonly onEvent: (event: RealtimeEvent) => void;
  readonly onStatus?: (status: RealtimeStatus) => void;
  readonly onConnected?: () => void;
  readonly createSocket?: (url: string) => SocketLike;
  readonly minDelayMs?: number;
  readonly maxDelayMs?: number;
}

export const realtimeUrlOf = (baseUrl: string): string =>
  `${baseUrl.replace(/\/+$/, '').replace(/^http/, 'ws')}${REALTIME_PATH}`;

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

export class RealtimeConnection {
  private socket: SocketLike | null = null;
  private token: string | null = null;
  private stopped = true;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: RealtimeOptions) {}

  start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.options.onStatus?.('offline');
  }

  private async connect(): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.options.onStatus?.('connecting');
    const token = await this.options.accessToken();
    if (token === null || this.isStopped()) {
      this.scheduleReconnect();
      return;
    }
    this.token = token;
    const create = this.options.createSocket ?? ((url: string) => new WebSocket(url));
    const socket = create(realtimeUrlOf(this.options.baseUrl));
    this.socket = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'hello', apiVersion: API_VERSION, accessToken: token }));
    };
    socket.onmessage = (event) => {
      this.handle(parseMessage(event.data));
    };
    socket.onclose = () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      socket.close();
    };
  }

  private isStopped(): boolean {
    return this.stopped;
  }

  private handle(message: ServerMessage | null): void {
    if (message === null) {
      return;
    }
    if (message.type === 'welcome') {
      this.attempt = 0;
      this.options.onStatus?.('online');
      this.options.onConnected?.();
      return;
    }
    if (message.type === 'event') {
      this.options.onEvent(message.event);
      return;
    }
    if (message.type === 'error' && message.code === 'unauthorized' && this.token !== null) {
      void this.options.renewToken(this.token);
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) {
      return;
    }
    this.options.onStatus?.('offline');
    const min = this.options.minDelayMs ?? 500;
    const max = this.options.maxDelayMs ?? 15_000;
    const delay = Math.min(max, min * 2 ** this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, delay);
  }
}
