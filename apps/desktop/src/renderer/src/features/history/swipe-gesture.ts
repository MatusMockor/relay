import type { ScrollRoom } from './horizontal-scroll';
import { isCoasting, recentSteps } from './momentum';
import type { HistoryDirection } from './navigation-history';

export interface WheelSample {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly pixels: boolean;
  readonly zoom: boolean;
  readonly path: readonly EventTarget[];
}

interface Ignored {
  readonly kind: 'ignored';
  readonly at: number;
}

interface Pending {
  readonly kind: 'pending';
  readonly room: ScrollRoom;
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

interface Tracking {
  readonly kind: 'tracking';
  readonly direction: HistoryDirection;
  readonly distance: number;
  readonly travelX: number;
  readonly travelY: number;
  readonly steps: readonly number[];
  readonly at: number;
}

type GestureState = { readonly kind: 'idle' } | Ignored | Pending | Tracking;

export const SWIPE_DISTANCE = 120;
const DECIDE_AFTER = 8;
const DRIFT_AFTER = 30;
const DOMINANCE = 2;
const STALE_MS = 100;

const IDLE: GestureState = { kind: 'idle' };

const ignored = (at: number): Ignored => ({ kind: 'ignored', at });

const drifted = (x: number, y: number): boolean => x + y >= DRIFT_AFTER && x <= DOMINANCE * y;

export class SwipeGesture {
  private armed = false;
  private state: GestureState = IDLE;

  constructor(
    private readonly roomFor: (path: readonly EventTarget[]) => ScrollRoom,
    private readonly now: () => number = () => performance.now(),
  ) {}

  begin(): void {
    this.armed = true;
    if (this.state.kind !== 'idle' && this.now() - this.state.at > STALE_MS) {
      this.state = IDLE;
    }
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
    const at = this.now();
    if (this.state.kind === 'ignored' || sample.zoom || !sample.pixels) {
      this.state = ignored(at);
      return null;
    }
    if (this.state.kind === 'tracking') {
      return this.track(this.state, sample, at);
    }
    const pending =
      this.state.kind === 'pending'
        ? this.state
        : { kind: 'pending' as const, room: this.roomFor(sample.path), x: 0, y: 0, at };
    this.state = this.decide({
      ...pending,
      x: pending.x + sample.deltaX,
      y: pending.y + sample.deltaY,
      at,
    });
    return null;
  }

  private decide(pending: Pending): GestureState {
    const x = Math.abs(pending.x);
    const y = Math.abs(pending.y);
    if (x + y < DECIDE_AFTER) {
      return pending;
    }
    const direction: HistoryDirection = pending.x < 0 ? 'back' : 'forward';
    if (x <= y || pending.room[direction]) {
      return ignored(pending.at);
    }
    const travel = { travelX: x, travelY: y, steps: [], at: pending.at };
    return { kind: 'tracking', direction, distance: x, ...travel };
  }

  private track(state: Tracking, sample: WheelSample, at: number): HistoryDirection | null {
    if (sample.deltaX === 0 && sample.deltaY === 0) {
      return this.release(at);
    }
    const travelX = state.travelX + Math.abs(sample.deltaX);
    const travelY = state.travelY + Math.abs(sample.deltaY);
    if (drifted(travelX, travelY)) {
      this.state = ignored(at);
      return null;
    }
    const step = state.direction === 'back' ? -sample.deltaX : sample.deltaX;
    const steps = recentSteps(state.steps, step);
    this.state = { ...state, distance: state.distance + step, travelX, travelY, steps, at };
    return isCoasting(steps) ? this.release(at) : null;
  }

  private release(at: number): HistoryDirection | null {
    const direction = this.armed ? this.reached() : null;
    this.state = ignored(at);
    return direction;
  }

  private reached(): HistoryDirection | null {
    if (this.state.kind !== 'tracking' || this.state.distance < SWIPE_DISTANCE) {
      return null;
    }
    return this.state.direction;
  }
}
