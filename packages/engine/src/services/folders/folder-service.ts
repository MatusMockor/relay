import type { CreateFolderBody, UpdateFolderBody } from '@relay/shared/api';
import type { AccountId, Mailbox, MailboxId, UserId } from '@relay/shared/domain';
import type { FolderCreator } from './folder-creator';
import type { FolderLookup } from './folder-lookup';
import type { FolderRemover } from './folder-remover';
import type { FolderRenamer } from './folder-renamer';

export interface FolderServiceDeps {
  readonly lookup: FolderLookup;
  readonly creator: FolderCreator;
  readonly renamer: FolderRenamer;
  readonly remover: FolderRemover;
}

export class FolderService {
  constructor(private readonly deps: FolderServiceDeps) {}

  async create(userId: UserId, accountId: AccountId, body: CreateFolderBody): Promise<Mailbox> {
    const scope = await this.deps.lookup.scope(userId, accountId);
    return this.deps.creator.create(scope, body.name, body.parentId);
  }

  async update(userId: UserId, mailboxId: MailboxId, patch: UpdateFolderBody): Promise<Mailbox> {
    const folder = await this.deps.lookup.folder(userId, mailboxId);
    return this.deps.renamer.update(folder, {
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.parentId === undefined ? {} : { parentId: patch.parentId }),
    });
  }

  async remove(userId: UserId, mailboxId: MailboxId): Promise<void> {
    const folder = await this.deps.lookup.folder(userId, mailboxId);
    await this.deps.remover.remove(folder);
  }
}
