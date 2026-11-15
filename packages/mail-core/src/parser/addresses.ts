import { EmailAddressSchema, type Address } from '@relay/shared/domain';
import type { AddressObject, EmailAddress } from 'mailparser';

const flatten = (entries: readonly EmailAddress[]): EmailAddress[] =>
  entries.flatMap((entry) => (entry.group ? flatten(entry.group) : [entry]));

const toAddress = (entry: EmailAddress): Address | null => {
  const email = EmailAddressSchema.safeParse(entry.address?.trim().toLowerCase());
  if (!email.success) {
    return null;
  }
  const name = entry.name.trim();
  return { name: name === '' ? null : name.slice(0, 500), email: email.data };
};

export const toAddresses = (value: AddressObject | AddressObject[] | undefined): Address[] => {
  if (value === undefined) {
    return [];
  }
  const objects = Array.isArray(value) ? value : [value];
  return objects
    .flatMap((object) => flatten(object.value))
    .map(toAddress)
    .filter((address): address is Address => address !== null);
};

export const firstAddress = (value: AddressObject | AddressObject[] | undefined): Address | null =>
  toAddresses(value)[0] ?? null;
