import { z } from 'zod';
import { ThreadIdSchema } from '../domain/ids';
import { streamChannel } from './define';

export const NotificationOpenedSchema = z.object({ threadId: ThreadIdSchema });
export type NotificationOpened = z.infer<typeof NotificationOpenedSchema>;

export const notificationStreamChannels = {
  'app.notification.opened': streamChannel(z.undefined(), NotificationOpenedSchema),
};
