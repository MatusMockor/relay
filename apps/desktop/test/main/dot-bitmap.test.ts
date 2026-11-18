import { describe, expect, it } from 'vitest';
import { dotBitmap } from '../../src/main/native/dot-bitmap';

const OPTIONS = { sizePx: 32, diameterPx: 16, scaleFactor: 2 };

const pixelAt = (pixels: Buffer, x: number, y: number) => {
  const offset = (y * OPTIONS.sizePx + x) * 4;
  return [...pixels.subarray(offset, offset + 4)];
};

describe('dotBitmap', () => {
  it('draws an opaque dot in BGRA order with a transparent border', () => {
    const bitmap = dotBitmap('#34C759', OPTIONS);
    expect(bitmap?.width).toBe(32);
    expect(bitmap?.height).toBe(32);
    expect(bitmap?.scaleFactor).toBe(2);
    expect(bitmap?.pixels.length).toBe(32 * 32 * 4);
    const pixels = bitmap?.pixels ?? Buffer.alloc(0);
    expect(pixelAt(pixels, 16, 16)).toEqual([0x59, 0xc7, 0x34, 255]);
    expect(pixelAt(pixels, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(pixels, 16, 3)).toEqual([0, 0, 0, 0]);
  });

  it('premultiplies the anti-aliased edge', () => {
    const pixels = dotBitmap('#ffffff', OPTIONS)?.pixels ?? Buffer.alloc(0);
    const [blue, green, red, alpha] = pixelAt(pixels, 16, 8);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(255);
    expect([blue, green, red]).toEqual([alpha, alpha, alpha]);
  });

  it('rejects colors that are not six digit hex values', () => {
    expect(dotBitmap('red', OPTIONS)).toBeNull();
    expect(dotBitmap('#fff', OPTIONS)).toBeNull();
  });
});
