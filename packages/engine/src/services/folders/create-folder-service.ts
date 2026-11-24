import type { EngineDeps } from '../../engine-deps';
import { MovedCopyMerger } from '../actions/moved-copy-merger';
import { LabelRemoval } from '../labels/label-removal';
import type { EngineEvents } from '../shared/engine-events';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import type { RoleMailboxEnsurer } from '../shared/role-mailbox-ensurer';
import { LabelRescans } from '../sync/label-rescans';
import { MailboxEvents } from '../sync/mailbox-events';
import { MailboxForgetter } from '../sync/mailbox-forgetter';
import { FolderCreator } from './folder-creator';
import { FolderEmptier } from './folder-emptier';
import { FolderLookup } from './folder-lookup';
import { FolderRemover } from './folder-remover';
import { FolderRenamer } from './folder-renamer';
import { FolderService } from './folder-service';
import { FolderThreadRefresher } from './folder-thread-refresh';
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
  const { mailboxes, messages, pendingWork, syncStates, labels } = repositories;
  const { sessions } = shared;
  const lookup = new FolderLookup(repositories.accounts, mailboxes);
  const events = new MailboxEvents({ mailboxes, labels, events: shared.events });
  const rescans = new LabelRescans({ pendingWork, syncStates, clock });
  const copies = new TrashedCopies({
    messages,
    pendingWork,
    merger: new MovedCopyMerger({ messages, unitOfWork, clock }),
    clock,
  });
  return new FolderService({
    lookup,
    creator: new FolderCreator({ mailboxes, labels, lookup, sessions, events, ids }),
    renamer: new FolderRenamer({ mailboxes, labels, unitOfWork, lookup, sessions, events }),
    remover: new FolderRemover({
      mailboxes,
      labels,
      labelRemoval: new LabelRemoval({ unitOfWork, clock }),
      sessions,
      emptier: new FolderEmptier({
        messages,
        syncStates,
        roleMailboxes: shared.roleMailboxes,
        copies,
        logger: deps.logger,
      }),
      forgetter: new MailboxForgetter({ messages, syncStates, unitOfWork, rescans }),
      threads: new FolderThreadRefresher({
        mailboxes,
        pendingWork,
        unitOfWork,
        events: shared.events,
      }),
      mailboxEvents: events,
      events: shared.events,
      clock,
    }),
  });
};
