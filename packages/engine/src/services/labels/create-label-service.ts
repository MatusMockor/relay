import type { EngineDeps } from '../../engine-deps';
import type { ProviderOpReplayer } from '../actions/provider-op-replayer';
import type { EngineEvents } from '../shared/engine-events';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import { GmailLabelAdmin } from './gmail-label-admin';
import { LabelAnnouncer } from './label-announcer';
import { LabelRemoval } from './label-removal';
import { LabelService } from './label-service';

export const createLabelService = (
  deps: EngineDeps,
  shared: {
    readonly events: EngineEvents;
    readonly sessions: MailProviderSessions;
    readonly replayer: ProviderOpReplayer;
  },
): LabelService => {
  const { repositories, idGenerator: ids } = deps;
  return new LabelService({
    accounts: repositories.accounts,
    labels: repositories.labels,
    mailboxes: repositories.mailboxes,
    pendingWork: repositories.pendingWork,
    removal: new LabelRemoval({ unitOfWork: deps.unitOfWork, clock: deps.clock }),
    gmail: new GmailLabelAdmin({
      labels: repositories.labels,
      mailboxes: repositories.mailboxes,
      sessions: shared.sessions,
      unitOfWork: deps.unitOfWork,
      ids,
    }),
    sessions: shared.sessions,
    replayer: shared.replayer,
    announcer: new LabelAnnouncer({
      labels: repositories.labels,
      mailboxes: repositories.mailboxes,
      events: shared.events,
    }),
    events: shared.events,
    ids,
    logger: deps.logger,
  });
};
