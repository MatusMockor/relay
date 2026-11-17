import { useEffect } from 'react';
import { setComposeRecipient } from '../../state/compose-recipient-store';
import type { RecipientEntry } from './recipients/address-parsing';

export const usePublishRecipient = (to: readonly RecipientEntry[]): void => {
  const first = to[0];
  const email = first?.valid === true ? first.address.email : null;
  const name = first?.valid === true ? first.address.name : null;
  useEffect(() => {
    setComposeRecipient(email === null ? null : { name, email });
  }, [email, name]);
  useEffect(
    () => () => {
      setComposeRecipient(null);
    },
    [],
  );
};
