import { EmailAddressSchema, type MailAccount } from '@relay/shared';

export const forwardAddressIssue = (
  to: string,
  account: MailAccount | undefined,
): string | null => {
  if (!EmailAddressSchema.safeParse(to).success) {
    return 'Zadaj platnú e-mailovú adresu';
  }
  if (account?.email.toLowerCase() === to.toLowerCase()) {
    return 'Nemôžeš preposielať na adresu vlastného účtu';
  }
  return null;
};
