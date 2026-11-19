import { z } from 'zod';
import { streamChannel } from './define';

export const FullScreenStatusSchema = z.object({ fullScreen: z.boolean() });
export type FullScreenStatus = z.infer<typeof FullScreenStatusSchema>;

export const TrackpadScrollPhaseSchema = z.enum(['begin', 'end']);
export type TrackpadScrollPhase = z.infer<typeof TrackpadScrollPhaseSchema>;

export const TrackpadScrollEventSchema = z.object({ phase: TrackpadScrollPhaseSchema });
export type TrackpadScrollEvent = z.infer<typeof TrackpadScrollEventSchema>;

export const PreviewKeySchema = z.enum(['Escape', 'ArrowLeft', 'ArrowRight']);
export type PreviewKey = z.infer<typeof PreviewKeySchema>;

export const PreviewKeyEventSchema = z.object({ key: PreviewKeySchema });
export type PreviewKeyEvent = z.infer<typeof PreviewKeyEventSchema>;

export const windowStreamChannels = {
  'app.window.fullScreen': streamChannel(z.undefined(), FullScreenStatusSchema),
  'app.window.trackpadScroll': streamChannel(z.undefined(), TrackpadScrollEventSchema),
  'app.window.previewKey': streamChannel(z.undefined(), PreviewKeyEventSchema),
};
