import type { EngineDeps } from '../../engine-deps';
import { attachmentReferenceLockFor } from '../attachments/attachment-reference-lock';
import type { AttachmentSweeper } from '../attachments/attachment-sweeper';
import type { EngineEvents } from '../shared/engine-events';
import { LeaseHeartbeat } from '../shared/lease-heartbeat';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import type { RoleMailboxEnsurer } from '../shared/role-mailbox-ensurer';
import { systemIntervalTimer } from '../shared/system-interval-timer';
import type { MessageIngestor } from '../sync/message-ingestor';
import { ComposeService } from './compose-service';
import { type AttachmentContentReader, DraftAttachmentService } from './draft-attachment-service';
import { DraftReferenceGuard } from './draft-reference-guard';
import { DraftSendClaims } from './draft-send-claims';
import { DraftSender } from './draft-sender';
import { DraftService } from './draft-service';
import { DraftThreadFlag } from './draft-thread-flag';
import { OutgoingMessageBuilder } from './outgoing-message-builder';
import { ScheduledSendConfirmations } from './scheduled-send-confirmations';
import { ScheduledSendDelivery } from './scheduled-send-delivery';
import { ScheduledSendService } from './scheduled-send-service';
import { SendLeases } from './send-leases';
import { SendService } from './send-service';
import { SentDraftCleanup } from './sent-draft-cleanup';
import { SentMessageRecorder } from './sent-message-recorder';

export const createComposeService = (
  deps: EngineDeps,
  shared: {
    readonly events: EngineEvents;
    readonly sessions: MailProviderSessions;
    readonly ingestor: MessageIngestor;
    readonly roleMailboxes: RoleMailboxEnsurer;
    readonly attachmentContent: AttachmentContentReader;
    readonly attachmentSweeper: AttachmentSweeper;
  },
): ComposeService => {
  const { repositories, clock, idGenerator: ids, logger } = deps;
  const { events } = shared;
  const drafts = new DraftService({
    drafts: repositories.drafts,
    messages: repositories.messages,
    references: new DraftReferenceGuard(
      repositories.drafts,
      repositories.accounts,
      repositories.threads,
    ),
    blobs: shared.attachmentSweeper,
    referenceLock: attachmentReferenceLockFor(deps.attachmentBlobs),
    threadFlag: new DraftThreadFlag(repositories.drafts, repositories.threads, events),
    events,
    clock,
    ids,
    logger,
  });
  const attachments = new DraftAttachmentService({
    drafts,
    store: deps.attachmentStore,
    messages: repositories.messages,
    content: shared.attachmentContent,
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
  });
  const claims = new DraftSendClaims(repositories.drafts, logger);
  const leases = new SendLeases({
    drafts: repositories.drafts,
    scheduledSends: repositories.scheduledSends,
    heartbeat: new LeaseHeartbeat(deps.intervalTimer ?? systemIntervalTimer, logger),
    clock,
  });
  const cleanup = new SentDraftCleanup(drafts, claims, logger);
  const confirmations = new ScheduledSendConfirmations({
    scheduledSends: repositories.scheduledSends,
    pendingWork: repositories.pendingWork,
    cleanup,
    events,
    logger,
  });
  const scheduled = new ScheduledSendService({
    scheduledSends: repositories.scheduledSends,
    drafts,
    delivery: new ScheduledSendDelivery({
      scheduledSends: repositories.scheduledSends,
      drafts,
      claims,
      leases,
      sending,
      cleanup,
      confirmations,
      clock,
      logger,
    }),
    confirmations,
    events,
    clock,
    ids,
  });
  const draftSender = new DraftSender({
    drafts,
    claims,
    leases,
    sending,
    cleanup,
    confirmations,
    clock,
  });
  return new ComposeService({ drafts, attachments, draftSender, sending, scheduled, clock });
};
