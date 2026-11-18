import type { AccountId, LabelId, Mailbox } from '@relay/shared';
import type { AnchorRect } from '@relay/ui';
import { create } from 'zustand';

export type FolderKind = 'folder' | 'label';

export interface FolderTarget {
  readonly mailbox: Mailbox;
  readonly kind: FolderKind;
  readonly name: string;
  readonly labelId?: LabelId;
}

export type FolderEdit =
  | { readonly kind: 'rename'; readonly target: FolderTarget }
  | { readonly kind: 'move'; readonly target: FolderTarget; readonly anchor: AnchorRect }
  | { readonly kind: 'delete'; readonly target: FolderTarget }
  | {
      readonly kind: 'create';
      readonly accountId: AccountId;
      readonly parent: FolderTarget | null;
    };

interface FolderEditState {
  readonly edit: FolderEdit | null;
}

export const useFolderEdit = create<FolderEditState>(() => ({ edit: null }));

export const setFolderEdit = (edit: FolderEdit | null): void => {
  useFolderEdit.setState({ edit });
};

export const isRenaming = (edit: FolderEdit | null, mailbox: Mailbox): boolean =>
  edit?.kind === 'rename' && edit.target.mailbox.id === mailbox.id;

export const isCreatingUnder = (edit: FolderEdit | null, mailbox: Mailbox | null): boolean =>
  edit?.kind === 'create' && (edit.parent?.mailbox.id ?? null) === (mailbox?.id ?? null);
