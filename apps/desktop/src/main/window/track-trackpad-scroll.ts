import type { TrackpadScrollEvent } from '@relay/shared/ipc';

export interface InputEventSource {
  on(
    event: 'input-event',
    listener: (event: unknown, input: { readonly type: string }) => void,
  ): unknown;
}

const SCROLL_PHASES: ReadonlyMap<string, TrackpadScrollEvent> = new Map([
  ['gestureScrollBegin', { phase: 'begin' }],
  ['gestureScrollEnd', { phase: 'end' }],
]);

export const trackTrackpadScroll = (
  contents: InputEventSource,
  publish: (event: TrackpadScrollEvent) => void,
): void => {
  contents.on('input-event', (_event, input) => {
    const scroll = SCROLL_PHASES.get(input.type);
    if (scroll === undefined) {
      return;
    }
    publish(scroll);
  });
};
