import { z } from 'zod';
import { OkResponseSchema } from '../api/common';
import { MailAccountSchema } from '../domain/account';
import { invokeChannel } from './define';
import { AccountScopeSchema } from './menu-channels';

export const MAX_REPORTED_ACCOUNTS = 100;

export const ReportedAccountSchema = MailAccountSchema.pick({
  id: true,
  displayName: true,
  email: true,
  color: true,
  status: true,
  lastSyncedAt: true,
});
export type ReportedAccount = z.infer<typeof ReportedAccountSchema>;

export const TrayReportSchema = z.object({
  scope: AccountScopeSchema,
  accounts: z.array(ReportedAccountSchema).max(MAX_REPORTED_ACCOUNTS),
});
export type TrayReport = z.infer<typeof TrayReportSchema>;

export const trayInvokeChannels = {
  'app.tray.report': invokeChannel(TrayReportSchema, OkResponseSchema),
};
