import type { Address } from '@relay/shared';

const AUTOMATED =
  /(no-?reply|notifications?|notify|mailer|newsletter|novinky|news@|redakcia|gitlab|github|sentry|jira|figma|vypisy|objednavky|comments@)/i;

export const isAutomated = (address: Address | null | undefined): boolean =>
  address !== null && address !== undefined && AUTOMATED.test(address.email);
