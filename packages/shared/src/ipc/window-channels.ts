import { z } from 'zod';
import { streamChannel } from './define';

export const FullScreenStatusSchema = z.object({ fullScreen: z.boolean() });
export type FullScreenStatus = z.infer<typeof FullScreenStatusSchema>;

export const windowStreamChannels = {
  'app.window.fullScreen': streamChannel(z.undefined(), FullScreenStatusSchema),
};
