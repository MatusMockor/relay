import { z } from 'zod';
import { streamChannel } from './define';

export const MenuCommandKindSchema = z.enum(['open-about']);
export type MenuCommandKind = z.infer<typeof MenuCommandKindSchema>;

export const MenuCommandSchema = z.object({ command: MenuCommandKindSchema });
export type MenuCommand = z.infer<typeof MenuCommandSchema>;

export const menuStreamChannels = {
  'app.menu.command': streamChannel(z.undefined(), MenuCommandSchema),
};
