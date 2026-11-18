import type { EngineDeps } from '../../engine-deps';
import { MovedCopyMerger } from '../actions/moved-copy-merger';
import type { EngineEvents } from '../shared/engine-events';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import type { RoleMailboxEnsurer } from '../shared/role-mailbox-ensurer';
import { LabelRescans } from '../sync/label-rescans';
import { MailboxEvents } from '../sync/mailbox-events';
import { MailboxForgetter } from '../sync/mailbox-forgetter';
import { FolderCreator } from './folder-creator';
import { FolderLookup } from './folder-lookup';
import { FolderRemover } from './folder-remover';
import { FolderRenamer } from './folder-renamer';
import { FolderService } from './folder-service';
import { FolderThreadRefresher } from './folder-thread-refresh';
import { FolderEmptier } from './folder-emptier';
import { GmailFolderLabels } from './gmail-folder-labels';
import { TrashedCopies } from './trashed-copies';

export const createFolderService = (
  deps: EngineDeps,
  shared: {
    readonly events: EngineEvents;
    readonly sessions: MailProviderSessions;
    readonly roleMailboxes: RoleMailboxEnsurer;
  },
): FolderService => {
  const { repositories, unitOfWork, clock, idGenerator: ids } = deps;
  const { mailboxes, messages, pendingWork, syncStates } = repositories;
  const { sessions } = shared;
  const lookup = new FolderLookup(repositories.accounts, mailboxes);
  const events = new MailboxEvents({
    mailboxes,
    labels: repositories.labels,
    events: shared.events,
  });
  const gmailLabels = new GmailFolderLabels({
    labels: repositories.labels,
    threads: repositories.threads,
    ids,
  });
  const rescans = new LabelRescans({ pendingWork, syncStates, clock });
  return new FolderService({
    lookup,
    creator: new FolderCreator({ mailboxes, lookup, sessions, gmailLabels, events, ids }),
    renamer: new FolderRenamer({ mailboxes, unitOfWork, lookup, sessions, gmailLabels, events }),
    remover: new FolderRemover({
      mailboxes,
      sessions,
      emptier: new FolderEmptier({
        roleMailboxes: shared.roleMailboxes,
        copies: new TrashedCopies({
          messages,
          pendingWork,
          merger: new MovedCopyMerger({ messages, unitOfWork, clock }),
          clock,
        }),
        logger: deps.logger,
      }),
      forgetter: new MailboxForgetter({ messages, syncStates, unitOfWork, rescans }),
      gmailLabels,
      threads: new FolderThreadRefresher({
        mailboxes,
        pendingWork,
        unitOfWork,
        events: shared.events,
      }),
      events,
      clock,
    }),
  });
};
