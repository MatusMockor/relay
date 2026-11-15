import { z } from 'zod';

export const WindowStateSchema = z.object({
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().min(400),
  height: z.number().int().min(300),
  maximized: z.boolean(),
});
export type WindowState = z.infer<typeof WindowStateSchema>;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_WINDOW_STATE: WindowState = { width: 1440, height: 900, maximized: false };

const MIN_VISIBLE = 64;

const visibleArea = (window: Rect, display: Rect): number => {
  const width =
    Math.min(window.x + window.width, display.x + display.width) - Math.max(window.x, display.x);
  const height =
    Math.min(window.y + window.height, display.y + display.height) - Math.max(window.y, display.y);
  return width >= MIN_VISIBLE && height >= MIN_VISIBLE ? width * height : 0;
};

const mostVisibleDisplay = (window: Rect, displays: readonly Rect[]): Rect | null =>
  displays.reduce<Rect | null>((best, display) => {
    const area = visibleArea(window, display);
    if (area === 0 || (best !== null && area <= visibleArea(window, best))) {
      return best;
    }
    return display;
  }, null);

export const fitWindowState = (state: WindowState, displays: readonly Rect[]): WindowState => {
  const largest = displays.reduce<Rect | null>(
    (best, display) =>
      best === null || display.width * display.height > best.width * best.height ? display : best,
    null,
  );
  const width = Math.min(state.width, largest?.width ?? state.width);
  const height = Math.min(state.height, largest?.height ?? state.height);
  if (state.x === undefined || state.y === undefined) {
    return { width, height, maximized: state.maximized };
  }
  const bounds = { x: state.x, y: state.y, width, height };
  const target = mostVisibleDisplay(bounds, displays);
  if (target === null) {
    return { width, height, maximized: state.maximized };
  }
  return { ...bounds, y: Math.max(bounds.y, target.y), maximized: state.maximized };
};
