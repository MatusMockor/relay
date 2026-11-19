import type { TrackpadScrollPhase } from '@relay/shared';
import { scrollsHorizontally } from '../history/horizontal-scroll';
import type { HistoryDirection } from '../history/navigation-history';
import { stepHistory } from '../history/step-history';
import { SwipeGesture } from '../history/swipe-gesture';

const gesture = new SwipeGesture(scrollsHorizontally);

const navigate = (direction: HistoryDirection | null): void => {
  if (direction === null) {
    return;
  }
  stepHistory(direction);
};

const onWheel = (event: WheelEvent): void => {
  navigate(
    gesture.wheel({
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      pixels: event.deltaMode === event.DOM_DELTA_PIXEL,
      zoom: event.ctrlKey,
      path: event.composedPath(),
    }),
  );
};

export const followTrackpadScroll = (phase: TrackpadScrollPhase): void => {
  if (phase === 'begin') {
    gesture.begin();
    return;
  }
  navigate(gesture.end());
};

export const resetTrackpadSwipe = (): void => {
  gesture.reset();
};

export const listenForSwipeWheel = (target: Window): (() => void) => {
  target.addEventListener('wheel', onWheel, { capture: true, passive: true });
  return () => {
    target.removeEventListener('wheel', onWheel, { capture: true });
  };
};
