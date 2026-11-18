import { z } from 'zod';
import { OkResponseSchema } from '../api/common';
import { ThreadIdSchema } from '../domain/ids';
import { invokeChannel, streamChannel } from './define';

export const NotificationOpenedSchema = z.object({ threadId: ThreadIdSchema });
export type NotificationOpened = z.infer<typeof NotificationOpenedSchema>;

export const NotificationRequestSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(2_000),
  threadId: ThreadIdSchema.nullable(),
});
export type NotificationRequest = z.infer<typeof NotificationRequestSchema>;

export const notificationInvokeChannels = {
  'app.notification.show': invokeChannel(NotificationRequestSchema, OkResponseSchema),
};

export const notificationStreamChannels = {
  'app.notification.opened': streamChannel(z.undefined(), NotificationOpenedSchema),
};
