const GMAIL_DOMAINS: ReadonlySet<string> = new Set(['gmail.com', 'googlemail.com']);

export const mailboxAddress = (email: string): string => {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  const domain = lower.slice(at + 1);
  if (at < 0 || !GMAIL_DOMAINS.has(domain)) {
    return lower;
  }
  const local = lower.slice(0, at).split('+')[0] ?? '';
  return `${local.replaceAll('.', '')}@gmail.com`;
};
