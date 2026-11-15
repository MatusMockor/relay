import type { DeviceId, UserId } from '@relay/shared/domain';
import type { ServerMessage } from '@relay/shared/realtime';
import { WebSocket } from 'ws';

export const POLICY_VIOLATION = 1008;

export class RealtimeConnection {
  constructor(
    private readonly socket: WebSocket,
    readonly userId: UserId,
    readonly deviceId: DeviceId,
  ) {}

  send(message: ServerMessage): void {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  close(code: number, reason: string): void {
    this.socket.close(code, reason);
  }
}
