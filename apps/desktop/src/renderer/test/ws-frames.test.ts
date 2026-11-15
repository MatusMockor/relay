import { describe, expect, it } from 'vitest';
import { decodeFrames } from './support/ws-server';

describe('test websocket frame decoding', () => {
  it('waits for the extended length bytes of a split frame', () => {
    const payload = Buffer.alloc(200, 0x61);
    const frame = Buffer.concat([Buffer.from([0x81, 0x7e, 0x00, 0xc8]), payload]);
    const head = decodeFrames(frame.subarray(0, 2));
    expect(head.frames).toEqual([]);
    expect(head.rest.length).toBe(2);
    const whole = decodeFrames(Buffer.concat([head.rest, frame.subarray(2)]));
    expect(whole.frames.map((item) => item.payload.toString('utf8'))).toEqual([
      payload.toString('utf8'),
    ]);
  });
});
