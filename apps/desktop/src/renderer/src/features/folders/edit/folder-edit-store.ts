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
    }
  | { readonly kind: 'create-label'; readonly accountId: AccountId };

interface FolderEditState {
  readonly edit: FolderEdit | null;
  readonly seq: number;
}

export const useFolderEdit = create<FolderEditState>(() => ({ edit: null, seq: 0 }));

export const setFolderEdit = (edit: FolderEdit | null): void => {
  useFolderEdit.setState((state) => ({ edit, seq: state.seq + 1 }));
};

export const closeFolderEdit = (seq: number): void => {
  if (useFolderEdit.getState().seq !== seq) {
    return;
  }
  setFolderEdit(null);
};

export const isRenaming = (edit: FolderEdit | null, mailbox: Mailbox): boolean =>
  edit?.kind === 'rename' && edit.target.mailbox.id === mailbox.id;

export const isCreatingLabel = (edit: FolderEdit | null, accountId: AccountId): boolean =>
  edit?.kind === 'create-label' && edit.accountId === accountId;

export const isCreatingUnder = (edit: FolderEdit | null, mailbox: Mailbox | null): boolean =>
  edit?.kind === 'create' && (edit.parent?.mailbox.id ?? null) === (mailbox?.id ?? null);
