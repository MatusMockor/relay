import type { HistoryDirection } from './navigation-history';

export interface WheelSample {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly pixels: boolean;
  readonly zoom: boolean;
  readonly path: readonly EventTarget[];
}

export type ScrollableCheck = (
  path: readonly EventTarget[],
  direction: HistoryDirection,
) => boolean;

interface Pending {
  readonly kind: 'pending';
  readonly path: readonly EventTarget[];
  readonly x: number;
  readonly y: number;
}

interface Tracking {
  readonly kind: 'tracking';
  readonly direction: HistoryDirection;
  readonly distance: number;
  readonly travelX: number;
  readonly travelY: number;
}

type GestureState = { readonly kind: 'idle' } | { readonly kind: 'ignored' } | Pending | Tracking;

export const SWIPE_DISTANCE = 120;
const DECIDE_AFTER = 8;
const DRIFT_AFTER = 30;
const DOMINANCE = 2;

const IDLE: GestureState = { kind: 'idle' };
const IGNORED: GestureState = { kind: 'ignored' };

const drifted = (x: number, y: number): boolean => x + y >= DRIFT_AFTER && x <= DOMINANCE * y;

export class SwipeGesture {
  private armed = false;
  private state: GestureState = IDLE;

  constructor(private readonly scrollable: ScrollableCheck) {}

  begin(): void {
    this.armed = true;
    this.state = IDLE;
  }

  end(): HistoryDirection | null {
    const direction = this.reached();
    this.state = IDLE;
    return direction;
  }

  reset(): void {
    this.armed = false;
    this.state = IDLE;
  }

  wheel(sample: WheelSample): HistoryDirection | null {
    if (!this.armed || this.state.kind === 'ignored') {
      return null;
    }
    if (sample.zoom || !sample.pixels) {
      this.state = IGNORED;
      return null;
    }
    if (this.state.kind === 'tracking') {
      return this.track(this.state, sample);
    }
    const pending = this.state.kind === 'pending' ? this.state : this.open(sample);
    this.state = this.decide({
      ...pending,
      x: pending.x + sample.deltaX,
      y: pending.y + sample.deltaY,
    });
    return null;
  }

  private open(sample: WheelSample): Pending {
    return { kind: 'pending', path: sample.path, x: 0, y: 0 };
  }

  private decide(pending: Pending): GestureState {
    const x = Math.abs(pending.x);
    const y = Math.abs(pending.y);
    if (x + y < DECIDE_AFTER) {
      return pending;
    }
    const direction: HistoryDirection = pending.x < 0 ? 'back' : 'forward';
    if (x <= y || this.scrollable(pending.path, direction)) {
      return IGNORED;
    }
    return { kind: 'tracking', direction, distance: x, travelX: x, travelY: y };
  }

  private track(state: Tracking, sample: WheelSample): HistoryDirection | null {
    if (sample.deltaX === 0 && sample.deltaY === 0) {
      const direction = this.reached();
      this.state = IGNORED;
      return direction;
    }
    const travelX = state.travelX + Math.abs(sample.deltaX);
    const travelY = state.travelY + Math.abs(sample.deltaY);
    if (drifted(travelX, travelY)) {
      this.state = IGNORED;
      return null;
    }
    const step = state.direction === 'back' ? -sample.deltaX : sample.deltaX;
    this.state = { ...state, distance: Math.max(0, state.distance + step), travelX, travelY };
    return null;
  }

  private reached(): HistoryDirection | null {
    if (this.state.kind !== 'tracking' || this.state.distance < SWIPE_DISTANCE) {
      return null;
    }
    return this.state.direction;
  }
}
