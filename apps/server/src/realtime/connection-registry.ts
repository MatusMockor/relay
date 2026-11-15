import { Injectable } from '@nestjs/common';
import type { DeviceId, UserId } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import { POLICY_VIOLATION, type RealtimeConnection } from './realtime-connection';

@Injectable()
export class ConnectionRegistry {
  private readonly byUser = new Map<UserId, Set<RealtimeConnection>>();

  add(connection: RealtimeConnection): void {
    const connections = this.byUser.get(connection.userId) ?? new Set<RealtimeConnection>();
    connections.add(connection);
    this.byUser.set(connection.userId, connections);
  }

  remove(connection: RealtimeConnection): void {
    const connections = this.byUser.get(connection.userId);
    if (connections === undefined) {
      return;
    }
    connections.delete(connection);
    if (connections.size === 0) {
      this.byUser.delete(connection.userId);
    }
  }

  publish(userId: UserId, event: RealtimeEvent): void {
    this.byUser.get(userId)?.forEach((connection) => {
      connection.send({ type: 'event', event });
    });
  }

  disconnectDevice(deviceId: DeviceId): void {
    this.byUser.forEach((connections) => {
      connections.forEach((connection) => {
        if (connection.deviceId === deviceId) {
          connection.close(POLICY_VIOLATION, 'Device revoked');
        }
      });
    });
  }

  countFor(userId: UserId): number {
    return this.byUser.get(userId)?.size ?? 0;
  }
}
