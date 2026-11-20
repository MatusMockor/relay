import type { FolderEdit, FolderTarget } from './folder-edit-store';

const targetKey = (target: FolderTarget): string => `${target.mailbox.id}:${target.labelId ?? ''}`;

const editKey = (edit: FolderEdit): string => {
  if (edit.kind === 'create') {
    return `create:${edit.accountId}:${edit.parent === null ? '' : targetKey(edit.parent)}`;
  }
  if (edit.kind === 'create-label') {
    return `create-label:${edit.accountId}`;
  }
  return `${edit.kind}:${targetKey(edit.target)}`;
};

export const sameEdit = (left: FolderEdit | null, right: FolderEdit | null): boolean => {
  if (left === null || right === null) {
    return left === right;
  }
  return editKey(left) === editKey(right);
};
