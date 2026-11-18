import { z } from 'zod';
import { invokeChannel } from './define';

export const ContextMenuItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('item'),
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(120),
    enabled: z.boolean(),
  }),
  z.object({ type: z.literal('separator') }),
]);
export type ContextMenuItem = z.infer<typeof ContextMenuItemSchema>;

export const ContextMenuRequestSchema = z.object({
  items: z.array(ContextMenuItemSchema).min(1).max(30),
  x: z.number().int(),
  y: z.number().int(),
});
export type ContextMenuRequest = z.infer<typeof ContextMenuRequestSchema>;

export const contextMenuInvokeChannels = {
  'app.contextMenu.show': invokeChannel(
    ContextMenuRequestSchema,
    z.object({ id: z.string().nullable() }),
  ),
};
