import type { Address } from '@relay/shared';

const AUTOMATED_LOCAL_PART =
  /(?:^|[._+-])(?:no-?reply|do-?not-?reply|notifications?|notify|mailer(?:-daemon)?|newsletters?|novinky|news|redakcia|gitlab|github|sentry|jira|figma|vypisy|objednavky|comments)(?:$|[._+-])/i;

const localPartOf = (email: string): string => email.slice(0, Math.max(0, email.lastIndexOf('@')));

export const isAutomated = (address: Address | null | undefined): boolean =>
  address !== null &&
  address !== undefined &&
  AUTOMATED_LOCAL_PART.test(localPartOf(address.email));
