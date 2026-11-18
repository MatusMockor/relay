import { z } from 'zod';
import { OkResponseSchema } from '../api/common';
import { ThreadIdSchema } from '../domain/ids';
import { invokeChannel, streamChannel } from './define';

export const NotificationOpenedSchema = z.object({ threadId: ThreadIdSchema });
export type NotificationOpened = z.infer<typeof NotificationOpenedSchema>;

export const NOTIFICATION_TITLE_MAX = 200;
export const NOTIFICATION_BODY_MAX = 2_000;

export const RendererSessionKeySchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export type RendererSessionKey = z.infer<typeof RendererSessionKeySchema>;

export const NotificationRequestSchema = z.object({
  title: z.string().min(1).max(NOTIFICATION_TITLE_MAX),
  body: z.string().max(NOTIFICATION_BODY_MAX),
  threadId: ThreadIdSchema.nullable(),
  session: RendererSessionKeySchema,
});
export type NotificationRequest = z.infer<typeof NotificationRequestSchema>;

export const notificationInvokeChannels = {
  'app.notification.show': invokeChannel(NotificationRequestSchema, OkResponseSchema),
};

export const notificationStreamChannels = {
  'app.notification.opened': streamChannel(z.undefined(), NotificationOpenedSchema),
};
