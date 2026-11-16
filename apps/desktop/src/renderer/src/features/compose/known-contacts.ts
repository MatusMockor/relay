import type { Address, ThreadPage } from '@relay/shared';
import { isAutomated } from '../thread/automated';

const keyOf = (address: Address): string => address.email.toLowerCase();

export const collectKnownContacts = (
  pages: readonly (ThreadPage | undefined)[],
  ownEmails: readonly string[],
): Address[] => {
  const own = new Set(ownEmails.map((email) => email.toLowerCase()));
  const unique = new Map<string, Address>();
  pages.forEach((page) => {
    page?.items.forEach((thread) => {
      thread.participants.forEach((address) => {
        const key = keyOf(address);
        if (own.has(key) || isAutomated(address)) {
          return;
        }
        if (unique.get(key)?.name && !address.name) {
          return;
        }
        unique.set(key, address);
      });
    });
  });
  return [...unique.values()];
};
