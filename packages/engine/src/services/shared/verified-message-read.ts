import type { Message } from '@relay/shared/domain';
import type { RawMessage } from '../../model/remote-mail';
import type { MailProvider } from '../../ports/mail-provider';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { LocatedPlacement } from './placement-locations';
import { reachable } from './provider-reachability';

export interface RemoteCopyLocation {
  readonly path: string;
  readonly uid: number;
  readonly uidValidity: number;
}

const readAt = async (
  provider: MailProvider,
  location: RemoteCopyLocation,
): Promise<RawMessage | null> => {
  const status = await provider.status(location.path);
  if (status.uidValidity !== location.uidValidity) {
    return null;
  }
  return provider.fetchMessage(location.path, location.uid);
};

export const readVerifiedMessage = async (
  provider: MailProvider,
  location: RemoteCopyLocation,
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

export const copyLocationOf = async (
  syncStates: SyncStateRepository,
  { placement, mailbox }: LocatedPlacement,
): Promise<RemoteCopyLocation | null> => {
  const state = await syncStates.find(mailbox.id);
  if (state === null) {
    return null;
  }
  return { path: mailbox.path, uid: placement.uid, uidValidity: state.uidValidity };
};

export const sameMessageId = (
  message: Pick<Message, 'messageIdHeader'>,
  parsed: { readonly messageIdHeader: string | null },
): boolean =>
  message.messageIdHeader === null || parsed.messageIdHeader === message.messageIdHeader;
