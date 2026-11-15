import type { Socket } from 'node:net';
import { LineFramer } from './line-framer';

export const DEFAULT_MAX_FRAME_BYTES = 64 * 1024 * 1024;

export class JsonLineChannel {
  private readonly listeners: ((message: unknown) => void)[] = [];
  private reading = false;

  constructor(
    private readonly socket: Socket,
    private readonly maxFrameBytes: number = DEFAULT_MAX_FRAME_BYTES,
  ) {
    socket.on('error', () => {
      socket.destroy();
    });
  }

  onMessage(listener: (message: unknown) => void): void {
    this.listeners.push(listener);
    if (this.reading) {
      return;
    }
    this.reading = true;
    const framer = new LineFramer(this.maxFrameBytes);
    this.socket.on('data', (chunk: Buffer) => {
      const lines = framer.push(chunk);
      if (lines === null) {
        this.socket.destroy();
        return;
      }
      for (const line of lines) {
        this.dispatch(parseLine(line));
      }
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

  private dispatch(message: unknown): void {
    for (const listener of this.listeners) {
      listener(message);
    }
  }
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch (_error) {
    return null;
  }
}
