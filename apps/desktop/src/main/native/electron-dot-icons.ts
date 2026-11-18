import { type NativeImage, nativeImage } from 'electron';
import { dotBitmap } from './dot-bitmap';
import type { DotIcons } from './tray-menu-template';

const DOT = { sizePx: 32, diameterPx: 16, scaleFactor: 2 } as const;

export class ElectronDotIcons implements DotIcons {
  private readonly cache = new Map<string, NativeImage | undefined>();

  dot(color: string): NativeImage | undefined {
    const key = color.toLowerCase();
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    const bitmap = dotBitmap(key, DOT);
    const image =
      bitmap === null
        ? undefined
        : nativeImage.createFromBitmap(bitmap.pixels, {
            width: bitmap.width,
            height: bitmap.height,
            scaleFactor: bitmap.scaleFactor,
          });
    this.cache.set(key, image);
    return image;
  }
}
