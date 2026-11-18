export interface DotBitmap {
  readonly width: number;
  readonly height: number;
  readonly scaleFactor: number;
  readonly pixels: Buffer;
}

export interface DotBitmapOptions {
  readonly sizePx: number;
  readonly diameterPx: number;
  readonly scaleFactor: number;
}

const HEX = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/;

const channelsOf = (hex: string): readonly [number, number, number] | null => {
  const match = HEX.exec(hex);
  if (match === null) {
    return null;
  }
  return [
    Number.parseInt(match[1] ?? '0', 16),
    Number.parseInt(match[2] ?? '0', 16),
    Number.parseInt(match[3] ?? '0', 16),
  ];
};

const coverage = (x: number, y: number, center: number, radius: number): number => {
  const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
  return Math.min(1, Math.max(0, radius + 0.5 - distance));
};

export const dotBitmap = (hex: string, options: DotBitmapOptions): DotBitmap | null => {
  const channels = channelsOf(hex);
  if (channels === null) {
    return null;
  }
  const [red, green, blue] = channels;
  const { sizePx, diameterPx, scaleFactor } = options;
  const pixels = Buffer.alloc(sizePx * sizePx * 4);
  const center = sizePx / 2;
  for (let y = 0; y < sizePx; y += 1) {
    for (let x = 0; x < sizePx; x += 1) {
      const alpha = coverage(x, y, center, diameterPx / 2);
      const offset = (y * sizePx + x) * 4;
      pixels[offset] = Math.round(blue * alpha);
      pixels[offset + 1] = Math.round(green * alpha);
      pixels[offset + 2] = Math.round(red * alpha);
      pixels[offset + 3] = Math.round(255 * alpha);
    }
  }
  return { width: sizePx, height: sizePx, scaleFactor, pixels };
};
