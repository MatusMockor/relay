import { describe, expect, it } from 'vitest';
import { createFrameHeightSettler } from '../src/features/thread/frame-height-settler';

describe('frame height settler', () => {
  it('follows the measured height while it keeps changing', () => {
    const settle = createFrameHeightSettler();

    expect([300, 500, 700].map((height) => settle(600, height))).toEqual([300, 500, 700]);
  });

  it('settles on the taller height when the measurement alternates', () => {
    const settle = createFrameHeightSettler();

    expect([300, 780, 300, 780, 300].map((height) => settle(400, height))).toEqual([
      300, 780, 780, 780, 780,
    ]);
  });

  it('settles when the alternation starts with the taller height', () => {
    const settle = createFrameHeightSettler();

    expect([780, 300, 780, 300].map((height) => settle(400, height))).toEqual([780, 300, 780, 780]);
  });

  it('still grows after settling and starts over when the frame width changes', () => {
    const settle = createFrameHeightSettler();
    [300, 780, 300].forEach((height) => settle(400, height));

    expect(settle(400, 900)).toBe(900);
    expect(settle(400, 300)).toBe(900);
    expect(settle(800, 200)).toBe(200);
  });
});
