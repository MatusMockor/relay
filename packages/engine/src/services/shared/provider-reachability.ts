import type { MailProvider } from '../../ports/mail-provider';

export const reachable = (provider: MailProvider): Promise<boolean> =>
  provider.listMailboxes().then(
    () => true,
    () => false,
  );
