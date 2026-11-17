import type { Address } from '@relay/shared';
import { create } from 'zustand';

interface ComposeRecipientState {
  readonly recipient: Address | null;
}

export const useComposeRecipient = create<ComposeRecipientState>(() => ({ recipient: null }));

export const setComposeRecipient = (recipient: Address | null): void => {
  useComposeRecipient.setState({ recipient });
};
