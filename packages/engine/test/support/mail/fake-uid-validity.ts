import { UidValidityChangedError } from '../../../src';
import type { FakeMailbox } from './fake-mail-server';

export const uidValidityMismatch = (
  mailbox: FakeMailbox,
  uidValidity: number | null,
): UidValidityChangedError | null => {
  if (uidValidity === null || uidValidity === mailbox.uidValidity) {
    return null;
  }
  return new UidValidityChangedError(mailbox.path, uidValidity, mailbox.uidValidity);
};
