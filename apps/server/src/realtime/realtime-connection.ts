import type { DeviceId, UserId } from '@relay/shared/domain';
import type { ServerMessage } from '@relay/shared/realtime';
import { WebSocket } from 'ws';

export const POLICY_VIOLATION = 1008;

export class RealtimeConnection {
  private held: ServerMessage[] | null = [];

  constructor(
    private readonly socket: WebSocket,
    readonly userId: UserId,
    readonly deviceId: DeviceId,
  ) {}

  open(welcome: ServerMessage): void {
    const held = this.held ?? [];
    this.held = null;
    this.write(welcome);
    held.forEach((message) => {
      this.write(message);
    });
  }

  send(message: ServerMessage): void {
    if (this.held !== null) {
      this.held.push(message);
      return;
    }
    this.write(message);
  }

  close(code: number, reason: string): void {
    this.socket.close(code, reason);
  }

  private write(message: ServerMessage): void {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }
}
