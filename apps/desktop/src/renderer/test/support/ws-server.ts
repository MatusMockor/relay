import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export interface TestSocket {
  send(data: string): void;
  close(): void;
  readonly messages: string[];
}

const encodeFrame = (opcode: number, payload: Buffer): Buffer => {
  const length = payload.length;
  const header =
    length < 126
      ? Buffer.from([0x80 | opcode, length])
      : Buffer.from([0x80 | opcode, 126, length >> 8, length & 0xff]);
  return Buffer.concat([header, payload]);
};

const decodeFrames = (
  buffer: Buffer,
): { frames: { opcode: number; payload: Buffer }[]; rest: Buffer } => {
  const frames: { opcode: number; payload: Buffer }[] = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const first = buffer[offset] ?? 0;
    const second = buffer[offset + 1] ?? 0;
    let length = second & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    }
    const masked = (second & 0x80) !== 0;
    const maskEnd = cursor + (masked ? 4 : 0);
    if (buffer.length < maskEnd + length) {
      break;
    }
    const mask = buffer.subarray(cursor, maskEnd);
    const payload = Buffer.from(buffer.subarray(maskEnd, maskEnd + length));
    if (masked) {
      payload.forEach((byte, index) => {
        payload[index] = byte ^ (mask[index % 4] ?? 0);
      });
    }
    frames.push({ opcode: first & 0x0f, payload });
    offset = maskEnd + length;
  }
  return { frames, rest: buffer.subarray(offset) };
};

export const acceptWebSocket = (
  request: IncomingMessage,
  socket: Duplex,
  onMessage: (socket: TestSocket, text: string) => void,
): TestSocket => {
  const key = request.headers['sec-websocket-key'] ?? '';
  const accept = createHash('sha1').update(`${key}${GUID}`).digest('base64');
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'),
  );
  let pending: Buffer = Buffer.alloc(0);
  const wrapper: TestSocket = {
    messages: [],
    send: (data) => {
      socket.write(encodeFrame(1, Buffer.from(data)));
    },
    close: () => {
      socket.write(encodeFrame(8, Buffer.alloc(0)));
      socket.end();
    },
  };
  socket.on('data', (chunk: Buffer) => {
    const { frames, rest } = decodeFrames(Buffer.concat([pending, chunk]));
    pending = rest;
    frames.forEach((frame) => {
      if (frame.opcode === 8) {
        socket.end();
        return;
      }
      if (frame.opcode !== 1) {
        return;
      }
      const text = frame.payload.toString('utf8');
      wrapper.messages.push(text);
      onMessage(wrapper, text);
    });
  });
  socket.on('error', () => undefined);
  return wrapper;
};
