import type { EngineDeps } from '../../engine-deps';
import type { EngineEvents } from '../shared/engine-events';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import type { RoleMailboxEnsurer } from '../shared/role-mailbox-ensurer';
import type { MessageIngestor } from '../sync/message-ingestor';
import { ComposeService } from './compose-service';
import { DraftService } from './draft-service';
import { DraftThreadFlag } from './draft-thread-flag';
import { OutgoingMessageBuilder } from './outgoing-message-builder';
import { ScheduledSendService } from './scheduled-send-service';
import { SendService } from './send-service';
import { SentMessageRecorder } from './sent-message-recorder';

export const createComposeService = (
  deps: EngineDeps,
  shared: {
    readonly events: EngineEvents;
    readonly sessions: MailProviderSessions;
    readonly ingestor: MessageIngestor;
    readonly roleMailboxes: RoleMailboxEnsurer;
  },
): ComposeService => {
  const { repositories, clock, idGenerator: ids, logger } = deps;
  const { events } = shared;
  const drafts = new DraftService({
    drafts: repositories.drafts,
    accounts: repositories.accounts,
    threads: repositories.threads,
    attachments: deps.attachmentStore,
    threadFlag: new DraftThreadFlag(repositories.drafts, repositories.threads, events),
    events,
    clock,
    ids,
  });
  const sending = new SendService({
    accounts: repositories.accounts,
    vault: deps.credentialVault,
    sender: deps.mailSender,
    builder: new OutgoingMessageBuilder(repositories.messages, deps.attachmentStore),
    recorder: new SentMessageRecorder({
      roleMailboxes: shared.roleMailboxes,
      splits: repositories.splits,
      sessions: shared.sessions,
      ingestor: shared.ingestor,
      unitOfWork: deps.unitOfWork,
      events,
      clock,
      logger,
    }),
    drafts,
    logger,
  });
  const scheduled = new ScheduledSendService({
    scheduledSends: repositories.scheduledSends,
    drafts,
    sending,
    events,
    clock,
    ids,
  });
  return new ComposeService({ drafts, sending, scheduled, clock });
};
