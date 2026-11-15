import type { Socket } from 'node:net';
import { createInterface } from 'node:readline';

export class JsonLineChannel {
  constructor(private readonly socket: Socket) {
    socket.on('error', () => {
      socket.destroy();
    });
  }

  onMessage(listener: (message: unknown) => void): void {
    const lines = createInterface({ input: this.socket, crlfDelay: Infinity });
    lines.on('error', () => {
      this.socket.destroy();
    });
    lines.on('line', (line) => {
      listener(parseLine(line));
    });
  }

  onClose(listener: () => void): void {
    this.socket.on('close', listener);
  }

  send(message: unknown): void {
    if (!this.socket.writable) {
      return;
    }
    this.socket.write(`${JSON.stringify(message)}\n`);
  }

  close(): void {
    this.socket.end();
  }

  destroy(): void {
    this.socket.destroy();
  }
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch (_error) {
    return null;
  }
}
