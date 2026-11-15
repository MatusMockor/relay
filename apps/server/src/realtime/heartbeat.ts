import type { WebSocket } from 'ws';

export class Heartbeat {
  private alive = true;

  constructor(private readonly socket: WebSocket) {
    socket.on('pong', () => {
      this.alive = true;
    });
  }

  beat(): void {
    if (!this.alive) {
      this.socket.terminate();
      return;
    }
    this.alive = false;
    this.socket.ping();
  }
}
