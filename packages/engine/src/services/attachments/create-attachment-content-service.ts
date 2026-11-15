import type { EngineDeps } from '../../engine-deps';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import { AttachmentContentService } from './attachment-content-service';
import { ReceivedAttachmentReader } from './received-attachment-reader';

export const createAttachmentContentService = (
  deps: EngineDeps,
  sessions: MailProviderSessions,
): AttachmentContentService => {
  const lookup = deps.messageAttachmentLookup;
  const extractor = deps.attachmentExtractor;
  const received =
    lookup === undefined || extractor === undefined
      ? null
      : new ReceivedAttachmentReader({
          lookup,
          extractor,
          accounts: deps.repositories.accounts,
          mailboxes: deps.repositories.mailboxes,
          sessions,
        });
  return new AttachmentContentService(deps.attachmentStore, received);
};
