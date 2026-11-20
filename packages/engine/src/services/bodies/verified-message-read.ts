import type { RawMessage } from '../../model/remote-mail';
import type { MailProvider } from '../../ports/mail-provider';
import { reachable } from '../shared/provider-reachability';

export interface MessageLocation {
  readonly path: string;
  readonly uid: number;
  readonly uidValidity: number;
}

const readAt = async (
  provider: MailProvider,
  location: MessageLocation,
): Promise<RawMessage | null> => {
  const status = await provider.status(location.path);
  if (status.uidValidity !== location.uidValidity) {
    return null;
  }
  return provider.fetchMessage(location.path, location.uid);
};

export const readVerifiedMessage = async (
  provider: MailProvider,
  location: MessageLocation,
): Promise<RawMessage | null> => {
  try {
    return await readAt(provider, location);
  } catch (error) {
    if (await reachable(provider)) {
      return null;
    }
    throw error;
  }
};
